import 'dotenv/config';
import sharp from 'sharp';
import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { createClient } from '@supabase/supabase-js';

const accountId = process.env.R2_ACCOUNT_ID;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
const bucketName = process.env.R2_BUCKET_NAME || 'tcg-cards';
const publicCdnUrl = process.env.PUBLIC_IMAGE_CDN_URL || 'https://pub-fc12cf26538b49798ca89e43c2bf3c4a.r2.dev';

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!accountId || !accessKeyId || !secretAccessKey) {
  console.error('Missing Cloudflare R2 credentials in .env');
  process.exit(1);
}

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials in .env');
  process.exit(1);
}

const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId, secretAccessKey },
});

const supabase = createClient(supabaseUrl, supabaseKey);

const THUMB_VERSION = 'v1';
const THUMB_WIDTHS = [240, 360, 480];

async function existsInR2(key) {
  try {
    await r2.send(new HeadObjectCommand({ Bucket: bucketName, Key: key }));
    return true;
  } catch (err) {
    return false;
  }
}

async function uploadBuffer(key, buffer) {
  await r2.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: buffer,
      ContentType: 'image/webp',
      CacheControl: 'public, max-age=31536000, immutable',
    })
  );
}

async function fetchWithRetry(url, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (res.ok) {
        const arrayBuf = await res.arrayBuffer();
        return Buffer.from(arrayBuf);
      }
    } catch (e) {
      if (attempt === maxRetries) throw e;
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
  return null;
}

function cleanFilenameFromUrl(url, cardNumber) {
  const parts = url.split('/');
  const rawName = parts[parts.length - 1];
  const nameWithoutExt = rawName.replace(/\.[^.]+$/, '').trim();
  const safeName = (nameWithoutExt || cardNumber || 'card').replace(/[^a-zA-Z0-9_-]/g, '_');
  return `${safeName}.webp`;
}

async function processCard(card) {
  const { id, card_number, image_path } = card;
  const filename = cleanFilenameFromUrl(image_path, card_number);
  const mainKey = `onepiece/${filename}`;
  const relativeDbPath = mainKey;

  const alreadyInR2 = await existsInR2(mainKey);

  if (!alreadyInR2) {
    const rawBuffer = await fetchWithRetry(image_path);
    if (!rawBuffer) {
      return { id, success: false, error: 'Download failed' };
    }

    // 1. Convert main image to optimized WebP
    const mainWebp = await sharp(rawBuffer)
      .webp({ quality: 82 })
      .toBuffer();
    await uploadBuffer(mainKey, mainWebp);

    // 2. Generate and upload each thumbnail size
    for (const width of THUMB_WIDTHS) {
      const thumbKey = `thumbs/${THUMB_VERSION}/${width}/${mainKey}`;
      const thumbWebp = await sharp(rawBuffer)
        .resize(width, null, { withoutEnlargement: true })
        .webp({ quality: 76 })
        .toBuffer();
      await uploadBuffer(thumbKey, thumbWebp);
    }
  }

  // 3. Update database record to point to R2 relative path
  const { error: dbErr } = await supabase
    .from('cards')
    .update({ image_path: relativeDbPath })
    .eq('id', id);

  if (dbErr) {
    return { id, success: false, error: dbErr.message };
  }

  return { id, success: true, key: mainKey };
}

async function main() {
  const args = process.argv.slice(2);
  const limitIdx = args.indexOf('--limit');
  const limit = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : Infinity;
  const concurrencyIdx = args.indexOf('--concurrency');
  const concurrency = concurrencyIdx !== -1 ? parseInt(args[concurrencyIdx + 1], 10) : 8;

  console.log('Querying One Piece cards with external image URLs...');
  const pendingCards = [];

  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('cards')
      .select('id, card_number, name, image_path')
      .eq('game', 'onepiece')
      .range(from, from + 999);

    if (error) {
      console.error('Database query error:', error);
      process.exit(1);
    }

    for (const c of data || []) {
      if (c.image_path && (c.image_path.startsWith('http://') || c.image_path.startsWith('https://'))) {
        pendingCards.push(c);
      }
    }

    if ((data || []).length < 1000) break;
  }

  console.log(`Found ${pendingCards.length} One Piece cards awaiting ingestion to R2.`);
  const queue = limit < pendingCards.length ? pendingCards.slice(0, limit) : pendingCards;
  console.log(`Processing ${queue.length} cards with concurrency ${concurrency}...`);

  let processedCount = 0;
  let successCount = 0;
  let failCount = 0;
  let queueIndex = 0;

  async function worker() {
    while (queueIndex < queue.length) {
      const idx = queueIndex++;
      const card = queue[idx];
      try {
        const res = await processCard(card);
        if (res.success) {
          successCount++;
        } else {
          failCount++;
          console.warn(`\nFailed [${card.card_number}]: ${res.error}`);
        }
      } catch (err) {
        failCount++;
        console.warn(`\nException [${card.card_number}]: ${err.message}`);
      }
      processedCount++;
      if (processedCount % 20 === 0 || processedCount === queue.length) {
        process.stdout.write(`Progress: ${processedCount}/${queue.length} (${successCount} ok, ${failCount} fail)\r`);
      }
    }
  }

  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);

  console.log(`\n\nIngestion completed!`);
  console.log(`Total: ${processedCount}`);
  console.log(`Success: ${successCount}`);
  console.log(`Failures: ${failCount}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
