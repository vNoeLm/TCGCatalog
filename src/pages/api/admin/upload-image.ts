import type { APIRoute } from 'astro';
import { supabaseAdmin } from '../../../lib/supabaseServer';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  try {
    const formData = await request.formData();
    const files = formData.getAll('files') as File[];

    if (!files || files.length === 0) {
      return new Response(JSON.stringify({ error: 'No files provided for upload.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const uploadedUrls: string[] = [];
    const timestamp = Date.now();

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!(file instanceof File) && typeof (file as any).arrayBuffer !== 'function') continue;

      const buffer = Buffer.from(await file.arrayBuffer());
      const rawExt = file.name.split('.').pop() || 'jpg';
      const cleanExt = rawExt.toLowerCase().replace(/[^a-z0-9]/g, '');
      const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
      const filePath = `showcase/${timestamp}_${i}_${safeName}`;

      const contentType = file.type || (cleanExt === 'png' ? 'image/png' : cleanExt === 'webp' ? 'image/webp' : 'image/jpeg');

      const { error: uploadError } = await supabaseAdmin.storage
        .from('card-images')
        .upload(filePath, buffer, {
          contentType,
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
      headers: {
        'Content-Type': 'application/json',
      },
    });
  } catch (err: any) {
    console.error('Upload endpoint error:', err);
    return new Response(JSON.stringify({
      error: err.message || 'Failed to upload images',
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
