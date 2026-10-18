import 'dotenv/config';
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

const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId,
    secretAccessKey,
  },
});

const supabase = createClient(supabaseUrl, supabaseKey);
const SUPABASE_BUCKET = 'card-images';
const THUMB_VERSION = 'v1';
const THUMB_WIDTHS = [240, 360, 480];
const CONCURRENCY = 10;

function contentTypeFor(path) {
  const lower = path.toLowerCase();
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.svg')) return 'image/svg+xml';
  return 'application/octet-stream';
}

async function existsInR2(key) {
  try {
    await r2.send(new HeadObjectCommand({ Bucket: bucketName, Key: key }));
    return true;
  } catch (err) {
    if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
      return false;
    }
    return false;
  }
}

async function copyFromSupabaseToR2(storagePath) {
  const cleanKey = storagePath.replace(/^\/+/, '');
  const alreadyThere = await existsInR2(cleanKey);
  if (alreadyThere) {
    return { status: 'skipped', key: cleanKey };
  }

  // Fetch from Supabase
  const supaUrl = `${supabaseUrl}/storage/v1/object/public/${SUPABASE_BUCKET}/${cleanKey}`;
  const res = await fetch(supaUrl);
  if (!res.ok) {
    return { status: 'not_found_on_supabase', key: cleanKey };
  }

  const arrayBuffer = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  await r2.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: cleanKey,
      Body: buffer,
      ContentType: contentTypeFor(cleanKey),
      CacheControl: 'public, max-age=31536000, immutable',
    })
  );

  return { status: 'uploaded', key: cleanKey, size: buffer.length };
}

async function main() {
  console.log(`Starting migration from Supabase ("${SUPABASE_BUCKET}") to Cloudflare R2 ("${bucketName}")...`);

  // 1. Gather all unique relative image paths from cards table
  console.log('Querying cards table for relative image paths...');
  const allCardPaths = new Set();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('cards')
      .select('image_path')
      .not('image_path', 'is', null)
      .range(from, from + 999);
    if (error) throw error;
    for (const row of data || []) {
      const p = row.image_path;
      if (p && !p.startsWith('http://') && !p.startsWith('https://')) {
        allCardPaths.add(p);
      }
    }
    if ((data || []).length < 1000) break;
  }

  console.log(`Found ${allCardPaths.size} unique card images in catalog.`);

  // Build the list of all files to sync: original + 3 thumbnail sizes
  const queue = [];
  for (const p of allCardPaths) {
    queue.push(p);
    for (const w of THUMB_WIDTHS) {
      queue.push(`thumbs/${THUMB_VERSION}/${w}/${p}`);
    }
  }

  console.log(`Total objects to process (originals + thumbnails): ${queue.length}`);

  let uploadedCount = 0;
  let skippedCount = 0;
  let missingCount = 0;
  let totalBytes = 0;

  // Process queue with concurrency
  let index = 0;
  async function worker() {
    while (index < queue.length) {
      const currentIndex = index++;
      const item = queue[currentIndex];
      try {
        const result = await copyFromSupabaseToR2(item);
        if (result.status === 'uploaded') {
          uploadedCount++;
          totalBytes += result.size || 0;
        } else if (result.status === 'skipped') {
          skippedCount++;
        } else if (result.status === 'not_found_on_supabase') {
          missingCount++;
        }

        if ((currentIndex + 1) % 50 === 0 || currentIndex + 1 === queue.length) {
          const progress = (((currentIndex + 1) / queue.length) * 100).toFixed(1);
          const mb = (totalBytes / 1024 / 1024).toFixed(1);
          console.log(
            `[${progress}%] Processed ${currentIndex + 1}/${queue.length} - Uploaded: ${uploadedCount} (${mb} MB), Skipped (already in R2): ${skippedCount}, Not in Supabase: ${missingCount}`
          );
        }
      } catch (err) {
        console.warn(`Error copying ${item}:`, err.message);
      }
    }
  }

  const workers = Array.from({ length: CONCURRENCY }, () => worker());
  await Promise.all(workers);

  console.log('\n--- Migration Summary ---');
  console.log(`Total checked: ${queue.length}`);
  console.log(`Newly uploaded to R2: ${uploadedCount} (${(totalBytes / 1024 / 1024).toFixed(2)} MB)`);
  console.log(`Skipped (already existed): ${skippedCount}`);
  console.log(`Missing on Supabase: ${missingCount}`);

  // Test sample image from R2
  const sample = Array.from(allCardPaths)[0];
  if (sample) {
    const testUrl = `${publicCdnUrl}/${sample}`;
    console.log(`\nVerifying sample image on R2 public CDN: ${testUrl}`);
    const check = await fetch(testUrl);
    console.log(`Sample verification status: HTTP ${check.status} (${check.headers.get('content-type')})`);
  }

  console.log('\nMigration to Cloudflare R2 complete!');
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
