import { LEGAL_MARKDOWN } from './legal-content.generated';
import { LEGAL_PAGES } from './legal-pages';
import { firstHeading, parseMarkdown, parseInline } from './markdown';

// The app has no Node typings, so describe the two Node modules this test needs.
declare const __dirname: string;
const { readdirSync, readFileSync } = jest.requireActual<{
  readdirSync: (dir: string) => string[];
  readFileSync: (file: string, encoding: 'utf8') => string;
}>('fs');
const { join } = jest.requireActual<{ join: (...parts: string[]) => string }>('path');

describe('markdown subset', () => {
  it('parses headings, paragraphs and lists', () => {
    const blocks = parseMarkdown('# Title\n\nSome\ntext.\n\n- a\n- b\n\n1. one\n2. two\n');
    expect(blocks.map((b) => b.type)).toEqual(['heading', 'paragraph', 'list', 'list']);
    expect(blocks[1]).toMatchObject({ inline: [{ text: 'Some text.' }] });
    expect(blocks[2]).toMatchObject({ ordered: false });
    expect(blocks[3]).toMatchObject({ ordered: true });
  });

  it('marks bold text and owner placeholders', () => {
    expect(parseInline('a **b** [TO BE PROVIDED BY AIAIA: x] c')).toEqual([
      { text: 'a ' },
      { text: 'b', bold: true },
      { text: ' ' },
      { text: '[TO BE PROVIDED BY AIAIA: x]', placeholder: true },
      { text: ' c' },
    ]);
  });
});

describe('docs/legal bundle', () => {
  it('has a document for every page, each starting with its heading', () => {
    for (const page of LEGAL_PAGES) {
      const text = LEGAL_MARKDOWN[page.slug];
      expect(text).toBeTruthy();
      expect(firstHeading(parseMarkdown(text))).toBe(page.heading);
    }
  });

  it('is up to date: run `node apps/mobile/src/features/public/generate-legal.mjs`', () => {
    const dir = join(__dirname, '..', '..', '..', '..', '..', 'docs', 'legal');
    const files = readdirSync(dir).filter((f) => f.endsWith('.md'));
    expect(files.map((f) => f.slice(0, -3)).sort()).toEqual(Object.keys(LEGAL_MARKDOWN).sort());
    for (const file of files) {
      const text = readFileSync(join(dir, file), 'utf8').replace(/\r\n/g, '\n');
      expect(LEGAL_MARKDOWN[file.slice(0, -3)]).toBe(text);
    }
  });
});
