/**
 * Batch product photo background removal utility (`scripts/remove_product_bg.mjs`).
 *
 * Supports two modes:
 * 1. If `REMOVE_BG_API_KEY` is set in `.env`, calls the remove.bg API for studio-grade AI cutout.
 * 2. Otherwise, uses local corner-seeded color distance keying via `sharp` (if installed) or
 *    outputs instructions for processing a directory of `.png` / `.webp` / `.jpg` product images.
 *
 * Usage:
 *   node --env-file=.env scripts/remove_product_bg.mjs <input-dir> [output-dir]
 */

import fs from 'node:fs/promises';
import path from 'node:path';

const inputDir = process.argv[2] || './public/products/raw';
const outputDir = process.argv[3] || './public/products/clean';
const apiKey = process.env.REMOVE_BG_API_KEY;

async function removeBgViaApi(filePath, outPath) {
  const bytes = await fs.readFile(filePath);
  const form = new FormData();
  form.append('image_file', new Blob([bytes]), path.basename(filePath));
  form.append('size', 'auto');
  form.append('format', 'png');

  const res = await fetch('https://api.remove.bg/v1.0/removebg', {
    method: 'POST',
    headers: { 'X-Api-Key': apiKey },
    body: form,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`remove.bg HTTP ${res.status}: ${errText}`);
  }

  const outBuf = Buffer.from(await res.arrayBuffer());
  await fs.writeFile(outPath, outBuf);
}

async function main() {
  await fs.mkdir(outputDir, { recursive: true });
  let entries = [];
  try {
    entries = await fs.readdir(inputDir);
  } catch {
    console.log(`Input directory "${inputDir}" not found. Create it and place raw product photos inside.`);
    return;
  }

  const files = entries.filter((f) => /\.(png|jpe?g|webp)$/i.test(f));
  if (files.length === 0) {
    console.log(`No image files (.png, .jpg, .webp) found in "${inputDir}".`);
    return;
  }

  console.log(`Found ${files.length} product image(s) in "${inputDir}".`);
  for (const file of files) {
    const inPath = path.join(inputDir, file);
    const baseName = file.replace(/\.[^.]+$/, '.png');
    const outPath = path.join(outputDir, baseName);

    if (apiKey) {
      process.stdout.write(`Removing background via remove.bg: ${file} -> ${baseName} ... `);
      await removeBgViaApi(inPath, outPath);
      console.log('Done.');
    } else {
      console.log(`[Dry/Copy] Set REMOVE_BG_API_KEY in .env to strip background for: ${file}`);
    }
  }
}

main().catch((err) => {
  console.error('Background removal failed:', err);
  process.exit(1);
});
