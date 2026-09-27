import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const publicDir = path.resolve('public');
const buildId = process.env.GITHUB_SHA || process.env.RADAR_BUILD_ID || `local-${Date.now()}`;

await mkdir(publicDir, { recursive: true });
await writeFile(
  path.join(publicDir, 'version.json'),
  `${JSON.stringify({ schemaVersion: 1, buildId, generatedAt: new Date().toISOString() }, null, 2)}\n`,
  'utf8',
);

console.log(`[build-version] ${buildId}`);
