import type { APIRoute } from 'astro';
import { supabase } from '../../../lib/supabase';

export const prerender = false;

interface PriceUpdatePayload {
  id: string;
  market_price_eur: number;
  market_price_foil_eur: number;
  last_price_updated_at: string;
}

/**
 * Price estimation / market provider resolver
 * Updated user baseline:
 * - Common: €0.15
 * - Uncommon: €0.30
 * - Rare: €1.00
 * - Epic: €3.50
 * - Showcase & above: Manual upload only (null market baseline)
 */
function resolveMarketPrice(card: any): { regularEur: number | null; foilEur: number | null } {
  const rarity = card.rarity || 'Common';

  // Showcase and above are manual upload only
  if (rarity === 'Showcase' || rarity === 'Special' || rarity === 'Signed') {
    return { regularEur: null, foilEur: null };
  }

  let base = 0.15;
  if (rarity === 'Uncommon') base = 0.30;
  if (rarity === 'Rare') base = 1.00;
  if (rarity === 'Epic') base = 3.50;

  // Calculate foil multiplier (1.8x)
  const regularEur = Number(base.toFixed(2));
  const foilEur = Number((base * 1.8).toFixed(2));

  return { regularEur, foilEur };
}

export const ALL: APIRoute = async ({ request }) => {
  const startTime = Date.now();

  // 1. Validate Cron Authorization Header
  const cronSecret = process.env.CRON_SECRET || (import.meta as any).env?.CRON_SECRET;
  const authHeader = request.headers.get('Authorization');
  const vercelCronHeader = request.headers.get('x-vercel-cron');

  if (cronSecret) {
    const isBearerValid = authHeader === `Bearer ${cronSecret}`;
    const isVercelCronValid = Boolean(vercelCronHeader);

    if (!isBearerValid && !isVercelCronValid) {
      return new Response(JSON.stringify({ error: 'Unauthorized: Invalid CRON_SECRET or missing authorization header' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  try {
    // 2. Fetch all cards to synchronize in chunked batches
    const { data: cards, error: fetchError } = await supabase
      .from('cards')
      .select('id, card_number, name, rarity, card_type, subtype, game')
      .limit(5000);

    if (fetchError) {
      return new Response(JSON.stringify({ error: 'Failed to fetch cards for price sync', details: fetchError }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const cardList = cards || [];
    const nowIso = new Date().toISOString();
    const BATCH_SIZE = 50;
    let totalUpdated = 0;

    // 3. Process chunked batches with rate-limit protection
    for (let i = 0; i < cardList.length; i += BATCH_SIZE) {
      const chunk = cardList.slice(i, i + BATCH_SIZE);

      const updates = chunk.map(card => {
        const { regularEur, foilEur } = resolveMarketPrice(card);
        return {
          id: card.id,
          market_price_eur: regularEur,
          market_price_foil_eur: foilEur,
        };
      });

      // Bulk update chunk via Supabase
      for (const update of updates) {
        const { error: updateError } = await supabase
          .from('cards')
          .update({
            market_price_eur: update.market_price_eur,
            market_price_foil_eur: update.market_price_foil_eur,
          })
          .eq('id', update.id);

        if (!updateError) {
          totalUpdated++;
        }
      }

      // Small backoff between batches to prevent database / API congestion
      if (i + BATCH_SIZE < cardList.length) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }

    const durationMs = Date.now() - startTime;

    return new Response(JSON.stringify({
      success: true,
      updatedCount: totalUpdated,
      totalCards: cardList.length,
      timestamp: nowIso,
      durationMs,
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    });
  } catch (err: any) {
    console.error('Unhandled error during daily price sync cron:', err);
    return new Response(JSON.stringify({
      success: false,
      error: err.message || 'Internal Server Error',
      durationMs: Date.now() - startTime,
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
