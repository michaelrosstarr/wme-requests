// Prepends header.js (the UserScript metadata block) to the rollup output
// (.out/main.user.js) — reformatted with Prettier so the compiled build artifact
// stays readable, close to the original hand-written script's style — and writes
// the result to userscript/wme-requests.user.js. That's the exact path the
// installed script's @updateURL/@downloadURL point at, so `npm run build`
// produces a file that's a drop-in replacement for existing installs.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import prettier from 'prettier';

const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(dir, '..');

const header = readFileSync(path.join(root, 'header.js'), 'utf8').trimEnd();
const rawBody = readFileSync(path.join(root, '.out/main.user.js'), 'utf8');
const body = (
  await prettier.format(rawBody, {
    parser: 'babel',
    printWidth: 120,
    singleQuote: true,
  })
).trimEnd();
const outPath = path.join(root, 'wme-requests.user.js');

writeFileSync(outPath, `${header}\n\n${body}\n`);
console.log(`Wrote ${path.relative(process.cwd(), outPath)}`);
