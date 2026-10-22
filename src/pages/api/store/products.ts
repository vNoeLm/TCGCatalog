import type { APIRoute } from 'astro';
import { supabaseAdmin } from '../../../lib/supabaseServer';
import { getRequestUser, jsonResponse } from '../../../lib/requestAuth';
import { slugify } from '../../../lib/storeConstants';

export const prerender = false;

/**
 * GET /api/store/products
 * Fetch products from the store_products table.
 * Public users only receive active, in-stock products.
 * Admins can see drafts, out of stock, and filter by status.
 */
export const GET: APIRoute = async ({ request }) => {
  try {
    const auth = await getRequestUser(request);
    const isAdmin = Boolean(auth?.isAdmin);

    const url = new URL(request.url);
    const category = url.searchParams.get('category');
    const brand = url.searchParams.get('brand');
    const game = url.searchParams.get('game');
    const status = url.searchParams.get('status');
    const search = url.searchParams.get('search')?.trim();
    const sort = url.searchParams.get('sort') || 'newest';

    let query = supabaseAdmin.from('store_products').select('*');

    // Soft delete check: never return deleted products
    query = query.is('deleted_at', null);

    // Access control: non-admins only see active products with stock
    if (!isAdmin) {
      query = query.eq('status', 'active').gt('stock_quantity', 0);
    } else if (status && status !== 'all') {
      query = query.eq('status', status);
    }

    if (category && category !== 'all') {
      query = query.eq('category', category);
    }

    if (brand && brand !== 'all') {
      query = query.eq('brand', brand);
    }

    if (game && game !== 'all') {
      if (game === 'universal') {
        query = query.or('game.is.null,game.eq.universal');
      } else {
        query = query.eq('game', game);
      }
    }

    if (search) {
      query = query.or(`name.ilike.%${search}%,brand.ilike.%${search}%,sku.ilike.%${search}%`);
    }

    // Sorting
    switch (sort) {
      case 'price_asc':
        query = query.order('price_huf', { ascending: true });
        break;
      case 'price_desc':
        query = query.order('price_huf', { ascending: false });
        break;
      case 'name':
        query = query.order('name', { ascending: true });
        break;
      case 'newest':
      default:
        query = query.order('created_at', { ascending: false });
        break;
    }

    const { data, error } = await query;

    if (error) {
      // If the table doesn't exist yet on Supabase, return friendly empty response with warning
      if ((error as any).code === '42P01') {
        return jsonResponse({
          products: [],
          total: 0,
          warning: 'Table public.store_products not yet created. Run migration 20261022000000_create_store_products.sql',
        });
      }
      return jsonResponse({ error: error.message }, 500);
    }

    return jsonResponse({
      products: data || [],
      total: data?.length || 0,
      isAdmin,
    });
  } catch (err: any) {
    return jsonResponse({ error: err.message || 'Internal Server Error' }, 500);
  }
};

/**
 * POST /api/store/products
 * Create a new store product. Admin only.
 */
export const POST: APIRoute = async ({ request }) => {
  try {
    const auth = await getRequestUser(request);
    if (!auth?.isAdmin) {
      return jsonResponse({ error: 'Unauthorized: Admin access required' }, 403);
    }

    const body = await request.json().catch(() => null);
    if (!body) {
      return jsonResponse({ error: 'Invalid request body' }, 400);
    }

    const {
      name,
      category,
      brand,
      game,
      sku,
      price_huf,
      original_price_huf,
      stock_quantity,
      status,
      description,
      images,
      attributes,
      is_featured,
    } = body;

    if (!name || !category || !brand || price_huf == null) {
      return jsonResponse({ error: 'Missing required fields (name, category, brand, price_huf)' }, 400);
    }

    const baseSlug = slugify(name);
    const uniqueSlug = `${baseSlug}-${Math.random().toString(36).substring(2, 7)}`;

    const newProduct = {
      name: name.trim(),
      slug: uniqueSlug,
      category,
      brand: brand.trim(),
      game: game && game !== 'universal' ? game : null,
      sku: sku ? sku.trim() : null,
      price_huf: Math.max(0, parseInt(price_huf, 10) || 0),
      original_price_huf: original_price_huf ? Math.max(0, parseInt(original_price_huf, 10)) : null,
      stock_quantity: Math.max(0, parseInt(stock_quantity, 10) || 0),
      status: status || 'draft',
      description: description ? description.trim() : null,
      images: Array.isArray(images) ? images : [],
      attributes: attributes && typeof attributes === 'object' ? attributes : {},
      is_featured: Boolean(is_featured),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabaseAdmin.from('store_products').insert(newProduct).select().single();

    if (error) {
      return jsonResponse({ error: error.message }, 500);
    }

    return jsonResponse({ success: true, product: data }, 201);
  } catch (err: any) {
    return jsonResponse({ error: err.message || 'Internal Server Error' }, 500);
  }
};

/**
 * PATCH /api/store/products
 * Update a store product (e.g. stock, price, status, metadata). Admin only.
 */
export const PATCH: APIRoute = async ({ request }) => {
  try {
    const auth = await getRequestUser(request);
    if (!auth?.isAdmin) {
      return jsonResponse({ error: 'Unauthorized: Admin access required' }, 403);
    }

    const body = await request.json().catch(() => null);
    if (!body || !body.id) {
      return jsonResponse({ error: 'Product ID is required for update' }, 400);
    }

    const { id, ...updates } = body;
    updates.updated_at = new Date().toISOString();

    if (updates.name && !updates.slug) {
      updates.slug = `${slugify(updates.name)}-${Math.random().toString(36).substring(2, 7)}`;
    }

    if (updates.game === 'universal') {
      updates.game = null;
    }

    const { data, error } = await supabaseAdmin
      .from('store_products')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return jsonResponse({ error: error.message }, 500);
    }

    return jsonResponse({ success: true, product: data });
  } catch (err: any) {
    return jsonResponse({ error: err.message || 'Internal Server Error' }, 500);
  }
};

/**
 * DELETE /api/store/products
 * Soft delete a product. Admin only.
 */
export const DELETE: APIRoute = async ({ request }) => {
  try {
    const auth = await getRequestUser(request);
    if (!auth?.isAdmin) {
      return jsonResponse({ error: 'Unauthorized: Admin access required' }, 403);
    }

    const url = new URL(request.url);
    const id = url.searchParams.get('id');

    if (!id) {
      return jsonResponse({ error: 'Product ID is required' }, 400);
    }

    const { error } = await supabaseAdmin
      .from('store_products')
      .update({ deleted_at: new Date().toISOString(), status: 'archived' })
      .eq('id', id);

    if (error) {
      return jsonResponse({ error: error.message }, 500);
    }

    return jsonResponse({ success: true, id });
  } catch (err: any) {
    return jsonResponse({ error: err.message || 'Internal Server Error' }, 500);
  }
};
