import type { APIRoute } from 'astro';
import { supabaseAdmin } from '../../../lib/supabaseServer';
import { getRequestUser, jsonResponse } from '../../../lib/requestAuth';
import { planImport, type ExistingProduct, type ImportDefaults, type ImportPlanItem } from '../../../lib/storeImport';
import type { ImportRow } from '../../../lib/storeCsv';
import { IMPORT_BATCH_SIZE } from '../../../lib/storeConstants';

export const prerender = false;

// Cloudflare Workers cap the number of outbound requests per invocation, and every update below is
// its own request, so a batch stays small. The admin screen sends the file in batches of this size.
const MAX_ROWS = IMPORT_BATCH_SIZE;
const LOOKUP_CHUNK = IMPORT_BATCH_SIZE;

/**
 * POST /api/store/import   { rows, defaults, dryRun }
 *
 * Applies a partner price list. Rows are matched to products by SKU: known SKUs are updated (only
 * the columns the file provides), unknown SKUs are created as drafts. With dryRun nothing is
 * written, so the admin screen can show exactly what will happen before confirming.
 */
export const POST: APIRoute = async ({ request }) => {
  try {
    const auth = await getRequestUser(request);
    if (!auth?.isAdmin) return jsonResponse({ error: 'Unauthorized: Admin access required' }, 403);

    const body = await request.json().catch(() => null);
    const rows: ImportRow[] = Array.isArray(body?.rows) ? body.rows : [];
    const defaults: ImportDefaults = body?.defaults && typeof body.defaults === 'object' ? body.defaults : {};
    const dryRun = Boolean(body?.dryRun);

    if (rows.length === 0) return jsonResponse({ error: 'No rows to import.' }, 400);
    if (rows.length > MAX_ROWS) return jsonResponse({ error: `Send at most ${MAX_ROWS} rows per request.` }, 400);

    // Which of these SKUs already exist (archived ones are reported, never silently revived).
    const skus = [...new Set(rows.map((r) => String(r.sku ?? '').trim()).filter(Boolean))];
    const existing = new Map<string, ExistingProduct>();
    const archived = new Set<string>();
    for (let i = 0; i < skus.length; i += LOOKUP_CHUNK) {
      const { data, error } = await supabaseAdmin
        .from('store_products')
        .select('id, sku, attributes, deleted_at')
        .in('sku', skus.slice(i, i + LOOKUP_CHUNK));
      if (error) return jsonResponse({ error: error.message }, 500);
      (data || []).forEach((p: any) => {
        if (p.deleted_at) archived.add(p.sku);
        else existing.set(p.sku, { id: p.id, sku: p.sku, attributes: p.attributes });
      });
    }

    const archivedItems: ImportPlanItem[] = [];
    const importable: ImportRow[] = [];
    rows.forEach((r) => {
      const sku = String(r.sku ?? '').trim();
      if (sku && archived.has(sku)) {
        archivedItems.push({ line: r.line, sku, name: r.name || '', action: 'error', error: 'This SKU belongs to an archived product.' });
      } else {
        importable.push(r);
      }
    });

    const plan = [...planImport(importable, existing, defaults), ...archivedItems].sort((a, b) => a.line - b.line);
    const summarize = (items: ImportPlanItem[]) => ({
      created: items.filter((i) => i.action === 'create').length,
      updated: items.filter((i) => i.action === 'update').length,
      errors: items.filter((i) => i.action === 'error').length,
    });
    const strip = ({ line, sku, name, action, error }: ImportPlanItem) => ({ line, sku, name, action, error });

    if (dryRun) {
      return jsonResponse({ dryRun: true, summary: summarize(plan), items: plan.map(strip) });
    }

    const now = new Date().toISOString();
    const privateRows: any[] = [];

    // Creates in one go.
    const creates = plan.filter((i) => i.action === 'create');
    if (creates.length > 0) {
      const { data, error } = await supabaseAdmin
        .from('store_products')
        .insert(creates.map((i) => ({ ...i.product, created_at: now, updated_at: now })))
        .select('id, sku');
      if (error) {
        // One bad row would otherwise fail the lot; report it against every create instead of half-applying.
        creates.forEach((i) => {
          i.action = 'error';
          i.error = (error as any).code === '23505' ? 'Duplicate SKU or slug.' : error.message;
        });
      } else {
        const idBySku = new Map((data || []).map((p: any) => [p.sku, p.id]));
        creates.forEach((i) => {
          if (i.priv) privateRows.push({ product_id: idBySku.get(i.sku), ...i.priv, updated_at: now });
        });
      }
    }

    // Updates one by one: each row touches its own set of columns.
    for (const item of plan.filter((i) => i.action === 'update')) {
      const id = existing.get(item.sku)!.id;
      if (item.product && Object.keys(item.product).length > 0) {
        const { error } = await supabaseAdmin
          .from('store_products')
          .update({ ...item.product, updated_at: now })
          .eq('id', id);
        if (error) {
          item.action = 'error';
          item.error = error.message;
          continue;
        }
      }
      if (item.priv) privateRows.push({ product_id: id, ...item.priv, updated_at: now });
    }

    if (privateRows.length > 0) {
      const { error } = await supabaseAdmin.from('store_product_private').upsert(privateRows, { onConflict: 'product_id' });
      if (error) return jsonResponse({ error: `Products saved, but supplier/cost data failed: ${error.message}` }, 500);
    }

    return jsonResponse({ dryRun: false, summary: summarize(plan), items: plan.map(strip) });
  } catch (err: any) {
    return jsonResponse({ error: err.message || 'Internal Server Error' }, 500);
  }
};
