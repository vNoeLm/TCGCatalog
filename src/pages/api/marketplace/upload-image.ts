import type { APIRoute } from 'astro';
import { supabaseAdmin } from '../../../lib/supabaseServer';

export const prerender = false;

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store, no-cache, must-revalidate',
};

export const POST: APIRoute = async ({ request }) => {
  try {
    // 1. Authenticate user session
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ success: false, error: 'Unauthorized: Missing bearer token.' }), {
        status: 401,
        headers: JSON_HEADERS,
      });
    }

    const token = authHeader.replace('Bearer ', '').trim();
    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !user) {
      return new Response(JSON.stringify({ success: false, error: 'Unauthorized: Invalid token.' }), {
        status: 401,
        headers: JSON_HEADERS,
      });
    }

    // 2. Parse form data
    const formData = await request.formData();
    const files = formData.getAll('files') as File[];

    if (!files || files.length === 0) {
      return new Response(JSON.stringify({ success: false, error: 'No files provided for upload.' }), {
        status: 400,
        headers: JSON_HEADERS,
      });
    }

    // Limit maximum files per upload
    if (files.length > 5) {
      return new Response(JSON.stringify({ success: false, error: 'Maximum 5 photos allowed per upload.' }), {
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
        return new Response(JSON.stringify({ success: false, error: `File ${file.name} exceeds the 10MB limit.` }), {
          status: 400,
          headers: JSON_HEADERS,
        });
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      const rawExt = file.name.split('.').pop() || 'jpg';
      const cleanExt = rawExt.toLowerCase().replace(/[^a-z0-9]/g, '');
      const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
      const filePath = `marketplace/${user.id}/${timestamp}_${i}_${safeName}`;

      const contentType = file.type || (cleanExt === 'png' ? 'image/png' : cleanExt === 'webp' ? 'image/webp' : 'image/jpeg');

      const { error: uploadError } = await supabaseAdmin.storage
        .from('card-images')
        .upload(filePath, buffer, {
          contentType,
          upsert: true,
        });

      if (uploadError) {
        console.error('Storage upload error for marketplace user:', uploadError);
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
    console.error('Marketplace photo upload endpoint error:', err);
    return new Response(JSON.stringify({
      success: false,
      error: err.message || 'Failed to upload condition photos.',
    }), {
      status: 500,
      headers: JSON_HEADERS,
    });
  }
};
