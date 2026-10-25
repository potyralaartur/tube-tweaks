// Builds dist/tube-tweaks-<version>.zip with only the files Chrome needs.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
const { version } = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
fs.mkdirSync('dist', { recursive: true });
const out = `dist/tube-tweaks-${version}.zip`;
fs.rmSync(out, { force: true });
execFileSync('zip', ['-r', '-q', out, 'manifest.json', 'src', 'popup', 'icons', 'assets'], { stdio: 'inherit' });
console.log(out);
