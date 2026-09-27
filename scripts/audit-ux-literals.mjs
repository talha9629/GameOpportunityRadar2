import { readdir, readFile, writeFile } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');
const TOKEN_FILE = 'src/design-tokens.css';

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walk(full));
    else out.push(full);
  }
  return out;
}

function normalizeHex(value) {
  const hex = value.toLowerCase();
  if (/^#[0-9a-f]{3}$/.test(hex)) return `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
  if (/^#[0-9a-f]{4}$/.test(hex)) return `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}${hex[4]}${hex[4]}`;
  return hex;
}

const files = await walk(SRC);
const cssFiles = files.filter((file) => extname(file) === '.css');
const componentFiles = files.filter((file) => ['.tsx', '.jsx'].includes(extname(file)));
const hexValues = new Map();
const outsideTokenValues = new Map();
const perFile = [];
const titleUsages = [];

for (const file of cssFiles) {
  const path = relative(ROOT, file);
  const text = await readFile(file, 'utf8');
  const unique = new Set();
  let literals = 0;
  for (const match of text.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) {
    literals += 1;
    const value = normalizeHex(match[0]);
    unique.add(value);
    const refs = hexValues.get(value) ?? [];
    refs.push(path);
    hexValues.set(value, refs);
    if (path !== TOKEN_FILE) {
      const outsideRefs = outsideTokenValues.get(value) ?? [];
      outsideRefs.push(path);
      outsideTokenValues.set(value, outsideRefs);
    }
  }
  perFile.push({ file: path, hexLiteralCount: literals, distinctHexColorCount: unique.size });
}

for (const file of componentFiles) {
  const text = await readFile(file, 'utf8');
  const lines = text.split(/\r?\n/);
  lines.forEach((line, index) => {
    if (/\btitle\s*=/.test(line)) {
      titleUsages.push({ file: relative(ROOT, file), line: index + 1, text: line.trim().slice(0, 220) });
    }
  });
}

perFile.sort((a, b) => b.distinctHexColorCount - a.distinctHexColorCount || b.hexLiteralCount - a.hexLiteralCount || a.file.localeCompare(b.file));

const report = {
  generatedAt: new Date().toISOString(),
  cssFileCount: cssFiles.length,
  tokenFile: TOKEN_FILE,
  distinctHexColorCount: hexValues.size,
  distinctHexColors: [...hexValues.keys()].sort(),
  distinctHexColorsOutsideTokenFile: outsideTokenValues.size,
  perFile,
  titleAttributeCount: titleUsages.length,
  titleAttributes: titleUsages,
};

await writeFile('ux-literal-audit.json', `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(`[ux-audit] CSS files: ${report.cssFileCount}`);
console.log(`[ux-audit] Distinct normalized hex colors: ${report.distinctHexColorCount}`);
console.log(`[ux-audit] Distinct hex colors outside ${TOKEN_FILE}: ${report.distinctHexColorsOutsideTokenFile}`);
console.log(`[ux-audit] title= attributes in TSX/JSX: ${report.titleAttributeCount}`);
for (const item of perFile.slice(0, 10)) console.log(`[ux-audit] colors ${item.file}: ${item.distinctHexColorCount} distinct / ${item.hexLiteralCount} literals`);
for (const item of titleUsages) console.log(`[ux-audit] title ${item.file}:${item.line} ${item.text}`);
