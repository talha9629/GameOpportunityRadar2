import { readdir, readFile, writeFile } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');

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
const titleUsages = [];

for (const file of cssFiles) {
  const text = await readFile(file, 'utf8');
  for (const match of text.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) {
    const value = normalizeHex(match[0]);
    const refs = hexValues.get(value) ?? [];
    refs.push(relative(ROOT, file));
    hexValues.set(value, refs);
  }
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

const report = {
  generatedAt: new Date().toISOString(),
  cssFileCount: cssFiles.length,
  distinctHexColorCount: hexValues.size,
  distinctHexColors: [...hexValues.keys()].sort(),
  titleAttributeCount: titleUsages.length,
  titleAttributes: titleUsages,
};

await writeFile('ux-literal-audit.json', `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(`[ux-audit] CSS files: ${report.cssFileCount}`);
console.log(`[ux-audit] Distinct normalized hex colors: ${report.distinctHexColorCount}`);
console.log(`[ux-audit] title= attributes in TSX/JSX: ${report.titleAttributeCount}`);
for (const item of titleUsages) console.log(`[ux-audit] title ${item.file}:${item.line} ${item.text}`);
