import type { APIRoute } from 'astro';
import { supabaseAdmin } from '../../../lib/supabaseServer';
import { getRequestUser } from '../../../lib/requestAuth';
import { verifyImageMagicBytes, sanitizeFileName } from '../../../lib/sanitize';

export const prerender = false;

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
};

export const POST: APIRoute = async ({ request }) => {
  try {
    const caller = await getRequestUser(request);
    if (!caller) {
      return new Response(JSON.stringify({ success: false, error: 'Unauthorized.' }), {
        status: 401,
        headers: JSON_HEADERS,
      });
    }
    if (!caller.isAdmin) {
      return new Response(JSON.stringify({ success: false, error: 'Forbidden: Admin access required.' }), {
        status: 403,
        headers: JSON_HEADERS,
      });
    }

    const formData = await request.formData();
    const files = formData.getAll('files') as File[];

    if (!files || files.length === 0) {
      return new Response(JSON.stringify({ success: false, error: 'No files provided for upload.' }), {
        status: 400,
        headers: JSON_HEADERS,
      });
    }

    const uploadedUrls: string[] = [];
    const timestamp = Date.now();

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!(file instanceof File) && typeof (file as any).arrayBuffer !== 'function') continue;

      // File size validation (max 10MB)
      if (file.size > 10 * 1024 * 1024) {
        return new Response(JSON.stringify({ success: false, error: `File ${file.name} exceeds 10MB limit.` }), {
          status: 400,
          headers: JSON_HEADERS,
        });
      }

      const buffer = Buffer.from(await file.arrayBuffer());

      // Binary magic bytes inspection (prevents SVG/HTML script execution)
      const verified = verifyImageMagicBytes(buffer);
      if (!verified.valid) {
        return new Response(JSON.stringify({
          success: false,
          error: `Invalid file format for ${file.name}. Only genuine WebP, JPEG, and PNG images are allowed.`,
        }), {
          status: 400,
          headers: JSON_HEADERS,
        });
      }

      const safeBase = sanitizeFileName(file.name.substring(0, file.name.lastIndexOf('.')) || 'image');
      const filePath = `showcase/${timestamp}_${i}_${safeBase}.${verified.ext}`;

      const { error: uploadError } = await supabaseAdmin.storage
        .from('card-images')
        .upload(filePath, buffer, {
          contentType: verified.mime,
          upsert: true,
        });

      if (uploadError) {
        console.error('Storage admin upload error:', uploadError);
        throw uploadError;
      }

      const { data: publicData } = supabaseAdmin.storage
        .from('card-images')
        .getPublicUrl(filePath);

      if (publicData?.publicUrl) {
        uploadedUrls.push(publicData.publicUrl);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      urls: uploadedUrls,
      count: uploadedUrls.length,
    }), {
      status: 200,
      headers: JSON_HEADERS,
    });
  } catch (err: any) {
    console.error('Upload endpoint error:', err);
    return new Response(JSON.stringify({
      success: false,
      error: err.message || 'Failed to upload images',
    }), {
      status: 500,
      headers: JSON_HEADERS,
    });
  }
};
