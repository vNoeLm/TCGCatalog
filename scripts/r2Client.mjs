import 'dotenv/config';
import { S3Client, PutObjectCommand, HeadObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

const accountId = process.env.R2_ACCOUNT_ID;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
const bucketName = process.env.R2_BUCKET_NAME || 'tcg-cards';
export const publicCdnUrl = process.env.PUBLIC_IMAGE_CDN_URL || 'https://pub-fc12cf26538b49798ca89e43c2bf3c4a.r2.dev';

export const isR2Configured = Boolean(accountId && accessKeyId && secretAccessKey);

export const r2Client = isR2Configured
  ? new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    })
  : null;

export async function uploadToR2(key, body, contentType = 'image/webp') {
  if (!r2Client) throw new Error('Cloudflare R2 is not configured.');
  const cleanKey = key.replace(/^\/+/, '');
  await r2Client.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: cleanKey,
      Body: body,
      ContentType: contentType,
      CacheControl: 'public, max-age=31536000, immutable',
    })
  );
  return `${publicCdnUrl}/${cleanKey}`;
}

export async function existsInR2(key) {
  if (!r2Client) return false;
  try {
    await r2Client.send(new HeadObjectCommand({ Bucket: bucketName, Key: key.replace(/^\/+/, '') }));
    return true;
  } catch (err) {
    return false;
  }
}

export async function deleteFromR2(key) {
  if (!r2Client) return;
  try {
    await r2Client.send(new DeleteObjectCommand({ Bucket: bucketName, Key: key.replace(/^\/+/, '') }));
  } catch {}
}
