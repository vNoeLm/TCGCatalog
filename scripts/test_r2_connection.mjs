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

async function testR2() {
  console.log('Testing R2 connection...');
  const testKey = 'test/connection.txt';
  const testContent = `Cloudflare R2 connected successfully at ${new Date().toISOString()}`;

  await r2.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: testKey,
      Body: testContent,
      ContentType: 'text/plain',
    })
  );

  console.log(`Test object uploaded to R2: ${bucketName}/${testKey}`);

  const publicUrl = `${publicCdnUrl}/${testKey}`;
  console.log(`Checking public URL: ${publicUrl}`);

  const res = await fetch(publicUrl);
  if (res.ok) {
    const text = await res.text();
    console.log(`Public fetch succeeded (HTTP ${res.status}): "${text.trim()}"`);
  } else {
    console.warn(`Public fetch returned HTTP ${res.status}. Note: It may take 1-2 minutes for new R2.dev subdomains to propagate globally.`);
  }
}

testR2().catch((err) => {
  console.error('R2 test failed:', err);
  process.exit(1);
});
