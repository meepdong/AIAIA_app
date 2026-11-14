// Placeholder for root scripts whose backing tooling arrives in a later brief.
// The owning brief replaces the script entry in the root package.json.
// Usage: node scripts/not-set-up.mjs <script-name> <owning-brief>
const [name = 'this script', brief = 'a later brief'] = process.argv.slice(2);
console.log(`"${name}" is not set up yet (arrives with ${brief}). Nothing was run.`);
process.exit(0);
