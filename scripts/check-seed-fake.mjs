// pnpm check:seed: fails if seeds, tests or local config contain anything that looks like a real person.
//  - Phones: every Indian mobile number (or any +<country> number) must be +91 90000 000xx.
//  - Names: every word of a person-name value (full_name, *_contact_name, guardian_name, first_name,
//    last_name, display_name) must come from scripts/fake-names.json.
// Names are found in INSERT ... (cols) VALUES (...) tuples and in `col = 'literal'` assignments,
// including SQL nested in string or dollar-quoted literals (pgTAP tests). For INSERT ... SELECT into
// a name column, every capitalised two-to-four-word literal in the statement is checked instead.
// Usage: node scripts/check-seed-fake.mjs [files or dirs...]   (defaults below)
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const defaults = ['supabase/seed.sql', 'supabase/seeds', 'supabase/tests', 'supabase/config.toml'];
const targets = (process.argv.length > 2 ? process.argv.slice(2) : defaults).map((p) =>
  resolve(root, p),
);

const fake = JSON.parse(readFileSync(join(root, 'scripts', 'fake-names.json'), 'utf8'));
const fakeWords = new Set([...fake.first, ...fake.last]);
const NAME_COL =
  /^(full_name|first_name|last_name|display_name|guardian_name|[a-z_]*contact_name)$/;
const ALLOWED_NATIONAL = /^90000000\d\d$/;

function listFiles(p) {
  if (!existsSync(p)) return [];
  if (statSync(p).isDirectory()) return readdirSync(p).flatMap((f) => listFiles(join(p, f)));
  return /\.(sql|toml|json|csv)$/.test(p) ? [p] : [];
}

const problems = [];
const report = (file, msg) => problems.push(`${relative(root, file)}: ${msg}`);

// ---- phones -------------------------------------------------------------------------------
function checkPhones(file, text) {
  const re = /(?<![\w-])(\+?)(\d[\d -]{6,16}\d)(?![\w])/g;
  for (const m of text.matchAll(re)) {
    const plus = m[1] === '+';
    const digits = m[2].replace(/[ -]/g, '');
    let national = null;
    if (digits.length === 12 && digits.startsWith('91')) national = digits.slice(2);
    else if (digits.length === 11 && digits.startsWith('0')) national = digits.slice(1);
    else if (digits.length === 10) national = digits;
    const indianMobile = national !== null && /^[6-9]\d{9}$/.test(national);
    if (indianMobile && !ALLOWED_NATIONAL.test(national))
      report(file, `phone "${m[0]}" is not +91 90000 000xx`);
    else if (
      plus &&
      !(digits.startsWith('91') && national && ALLOWED_NATIONAL.test(national)) &&
      digits.length >= 8
    )
      report(file, `phone "${m[0]}" is not +91 90000 000xx`);
  }
}

// ---- SQL tokenizer ------------------------------------------------------------------------
function tokenize(sql) {
  const toks = [];
  let i = 0;
  while (i < sql.length) {
    const c = sql[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (c === '-' && sql[i + 1] === '-') {
      i = sql.indexOf('\n', i);
      if (i < 0) break;
      continue;
    }
    if (c === '/' && sql[i + 1] === '*') {
      const e = sql.indexOf('*/', i + 2);
      i = e < 0 ? sql.length : e + 2;
      continue;
    }
    if (c === "'") {
      let j = i + 1,
        s = '';
      while (j < sql.length) {
        if (sql[j] === "'" && sql[j + 1] === "'") {
          s += "'";
          j += 2;
          continue;
        }
        if (sql[j] === "'") break;
        s += sql[j++];
      }
      toks.push({ t: 'str', v: s });
      i = j + 1;
      continue;
    }
    if (c === '$') {
      const m = /^\$([A-Za-z_]\w*)?\$/.exec(sql.slice(i));
      if (m) {
        const end = sql.indexOf(m[0], i + m[0].length);
        const body = sql.slice(i + m[0].length, end < 0 ? sql.length : end);
        toks.push({ t: 'str', v: body });
        i = end < 0 ? sql.length : end + m[0].length;
        continue;
      }
    }
    const w = /^[A-Za-z_][\w.]*/.exec(sql.slice(i));
    if (w) {
      toks.push({ t: 'word', v: w[0].toLowerCase() });
      i += w[0].length;
      continue;
    }
    if (c === ':' && sql[i + 1] === '=') {
      toks.push({ t: 'p', v: ':=' });
      i += 2;
      continue;
    }
    toks.push({ t: 'p', v: c });
    i++;
  }
  return toks;
}

function checkName(file, value, ctx) {
  const words = value.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return;
  const bad = words.filter((w) => !fakeWords.has(w));
  if (bad.length)
    report(
      file,
      `name "${value}" (${ctx}) uses words not in scripts/fake-names.json: ${bad.join(', ')}`,
    );
}

const looksLikeName = (s) => /^[A-Z][a-z]+( [A-Z][a-z]+){1,3}$/.test(s);

// Reads a parenthesised, comma-separated list starting at toks[i] === '('. Returns [items, nextIndex];
// each item is the token array of that element.
function readList(toks, i) {
  const items = [[]];
  let depth = 0;
  for (; i < toks.length; i++) {
    const k = toks[i];
    if (k.t === 'p' && k.v === '(') {
      if (depth++ === 0) continue;
    } else if (k.t === 'p' && k.v === ')') {
      if (--depth === 0) return [items, i + 1];
    } else if (k.t === 'p' && k.v === ',' && depth === 1) {
      items.push([]);
      continue;
    }
    items[items.length - 1].push(k);
  }
  return [items, i];
}

function scanSql(file, sql, depth = 0) {
  const toks = tokenize(sql);
  for (let i = 0; i < toks.length; i++) {
    const k = toks[i];
    // nested SQL in literals (pgTAP)
    if (k.t === 'str' && depth < 3 && /\b(insert|update)\b/i.test(k.v))
      scanSql(file, k.v, depth + 1);
    // col = 'literal'
    if (
      k.t === 'word' &&
      NAME_COL.test(k.v.split('.').pop()) &&
      toks[i + 1]?.t === 'p' &&
      (toks[i + 1].v === '=' || toks[i + 1].v === ':=') &&
      toks[i + 2]?.t === 'str'
    ) {
      checkName(file, toks[i + 2].v, k.v);
    }
    // insert into X (cols) values (...), (...)  |  insert into X (cols) select ...
    if (k.t === 'word' && k.v === 'insert' && toks[i + 1]?.v === 'into') {
      let j = i + 3;
      if (toks[j]?.v !== '(') continue;
      const [colItems, after] = readList(toks, j);
      const cols = colItems.map((it) => it.map((x) => x.v).join(''));
      const nameIdx = cols.map((c, n) => (NAME_COL.test(c) ? n : -1)).filter((n) => n >= 0);
      if (nameIdx.length === 0) continue;
      j = after;
      if (toks[j]?.v === 'values') {
        j++;
        while (toks[j]?.v === '(') {
          const [vals, next] = readList(toks, j);
          for (const n of nameIdx) {
            const v = vals[n] ?? [];
            if (v.length === 1 && v[0].t === 'str') checkName(file, v[0].v, cols[n]);
            else if (!(v.length === 1 && v[0].v === 'null'))
              for (const x of v)
                if (x.t === 'str' && looksLikeName(x.v)) checkName(file, x.v, cols[n]);
          }
          j = next;
          if (toks[j]?.v === ',') j++;
        }
      } else {
        // INSERT ... SELECT: check every name-like literal up to the end of the statement.
        for (; j < toks.length && toks[j].v !== ';'; j++)
          if (toks[j].t === 'str' && looksLikeName(toks[j].v))
            checkName(file, toks[j].v, 'insert ... select');
      }
    }
  }
}

const files = targets.flatMap(listFiles);
for (const f of files) {
  const text = readFileSync(f, 'utf8');
  checkPhones(f, text);
  if (f.endsWith('.sql')) scanSql(f, text);
}

if (problems.length) {
  console.error(`seed check FAILED (${problems.length} problem(s)):`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`seed OK (${files.length} files checked)`);
