// Bumps the userscript's @version to a date-based `YYYY.MM.DD.N`, where N counts
// releases made on the same (UTC) day. If header.js is already on today's date,
// N is incremented; otherwise the version resets to today's `.1`. The new
// version is written to both header.js and header-dev.js so they stay in sync.
//
// Tampermonkey compares versions segment by segment as numbers, so `2026.x`
// sorts above the old semver `2.x` and `06` reads as 6 — existing installs still
// pick the update up via @updateURL.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(dir, '..');
const headerFiles = ['header.js', 'header-dev.js'].map((f) => path.join(root, f));

const VERSION_RE = /^(\/\/\s*@version\s+)(\S+)/m;

const now = new Date();
const today = [
  now.getUTCFullYear(),
  String(now.getUTCMonth() + 1).padStart(2, '0'),
  String(now.getUTCDate()).padStart(2, '0'),
].join('.');

const current = readFileSync(headerFiles[0], 'utf8').match(VERSION_RE)?.[2];
if (!current) {
  console.error(`No @version line found in ${path.basename(headerFiles[0])}`);
  process.exit(1);
}

const sameDay = current.match(new RegExp(`^${today.replaceAll('.', '\\.')}\\.(\\d+)$`));
const next = `${today}.${sameDay ? Number(sameDay[1]) + 1 : 1}`;

for (const file of headerFiles) {
  const src = readFileSync(file, 'utf8');
  if (!VERSION_RE.test(src)) {
    console.error(`No @version line found in ${path.basename(file)}`);
    process.exit(1);
  }
  writeFileSync(file, src.replace(VERSION_RE, (_, prefix) => `${prefix}${next}`));
}

console.log(`${current} -> ${next}`);
