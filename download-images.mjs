// Downloads every image URL found in hotel-data.json into public/images/
// Usage (from your project root, Node 18+):  node download-images.mjs
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const data = await readFile('hotel-data.json', 'utf8');
const urls = [...new Set(data.match(/https:\/\/hotel\.queuecommerce\.com\/wp-content\/uploads\/[^"]+\.(?:jpe?g|png|webp)/gi))];

const outDir = path.join('public', 'images');
await mkdir(outDir, { recursive: true });

let ok = 0;
for (const url of urls) {
  const name = path.basename(new URL(url).pathname);
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    await writeFile(path.join(outDir, name), Buffer.from(await res.arrayBuffer()));
    console.log('saved  ', name);
    ok++;
  } catch (e) {
    console.log('FAILED ', name, e.message);
  }
}
console.log(`\n${ok}/${urls.length} images saved to ${outDir}`);
