import type { APIRoute } from 'astro';
import { supabaseAdmin } from '../../../lib/supabaseServer';
import { getRequestUser, jsonResponse } from '../../../lib/requestAuth';
import { sanitizePlainText } from '../../../lib/sanitize';
import { CONTACT_EMAIL } from '../../../lib/site';

export const prerender = false;

const VALID_STATUSES = ['pending', 'approved', 'rejected', 'refunded'] as const;

/** Fallback to store withdrawals in settings JSON if migration hasn't been run yet */
async function fallbackSaveWithdrawal(entry: any) {
  try {
    const { data } = await supabaseAdmin.from('settings').select('value').eq('key', 'store_withdrawals').maybeSingle();
    const existing = Array.isArray(data?.value) ? data.value : [];
    const updated = [entry, ...existing];
    await supabaseAdmin.from('settings').upsert({ key: 'store_withdrawals', value: updated });
    return true;
  } catch (e) {
    console.error('Fallback save withdrawal error:', e);
    return false;
  }
}

async function fallbackGetWithdrawals() {
  try {
    const { data } = await supabaseAdmin.from('settings').select('value').eq('key', 'store_withdrawals').maybeSingle();
    return Array.isArray(data?.value) ? data.value : [];
  } catch (e) {
    return [];
  }
}

async function fallbackUpdateWithdrawal(id: string, updates: any) {
  try {
    const { data } = await supabaseAdmin.from('settings').select('value').eq('key', 'store_withdrawals').maybeSingle();
    const existing = Array.isArray(data?.value) ? data.value : [];
    const updated = existing.map((w: any) => (w.id === id ? { ...w, ...updates, updated_at: new Date().toISOString() } : w));
    await supabaseAdmin.from('settings').upsert({ key: 'store_withdrawals', value: updated });
    return true;
  } catch (e) {
    return false;
  }
}

/** Dispatches email notification if RESEND_API_KEY is configured */
async function sendNotificationEmail(withdrawal: any) {
  const apiKey = process.env.RESEND_API_KEY || (import.meta as any).env?.RESEND_API_KEY;
  if (!apiKey) {
    console.log('[WITHDRAWAL_EMAIL_LOG]', {
      to: CONTACT_EMAIL,
      subject: `[Elállási Nyilatkozat] #${withdrawal.order_number} - ${withdrawal.customer_name}`,
      withdrawal,
    });
    return;
  }

  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: 'TCG XChange Store <noreply@tcgxchange.net>',
        to: [CONTACT_EMAIL],
        reply_to: withdrawal.customer_email,
        subject: `[Elállási Nyilatkozat] Rendelés #${withdrawal.order_number} - ${withdrawal.customer_name}`,
        html: `
          <h2>Új Elállási Nyilatkozat Érkezett</h2>
          <p>Egy vásárló online elállási nyilatkozatot (14 napos elállási jog) nyújtott be a hivatalos Store felületen.</p>
          <hr />
          <p><strong>Rendelésszám:</strong> #${withdrawal.order_number}</p>
          <p><strong>Vásárló neve:</strong> ${withdrawal.customer_name}</p>
          <p><strong>E-mail:</strong> <a href="mailto:${withdrawal.customer_email}">${withdrawal.customer_email}</a></p>
          <p><strong>Telefonszám:</strong> ${withdrawal.customer_phone || 'Nem adott meg'}</p>
          <p><strong>Rendelés/Átvétel dátuma:</strong> ${withdrawal.order_date}</p>
          <p><strong>Visszaküldött termékek:</strong><br />${(withdrawal.items_summary || '').replace(/\n/g, '<br />')}</p>
          <p><strong>Visszatérítési bankszámla (IBAN):</strong> ${withdrawal.bank_account}</p>
          <p><strong>Elállás oka:</strong> ${withdrawal.reason || 'Nincs megadva (jogszabály szerint nem kötelező)'}</p>
          <p><strong>Időpont:</strong> ${new Date(withdrawal.created_at).toLocaleString('hu-HU')}</p>
          <hr />
          <p><a href="https://tcgxchange.net/store/admin">Megtekintés az Admin Felületen &rarr;</a></p>
        `,
      }),
    });
  } catch (e) {
    console.error('Failed to send Resend email:', e);
  }
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return jsonResponse({ success: false, error: 'Invalid request body.' }, 400);
    }

    const order_number = sanitizePlainText(body.order_number, 60);
    const customer_name = sanitizePlainText(body.customer_name, 120);
    const customer_email = sanitizePlainText(body.customer_email, 120).trim().toLowerCase();
    const customer_phone = body.customer_phone ? sanitizePlainText(body.customer_phone, 40) : null;
    const order_date = sanitizePlainText(body.order_date, 60);
    const items_summary = sanitizePlainText(body.items_summary, 2000);
    const bank_account = sanitizePlainText(body.bank_account, 80);
    const reason = body.reason ? sanitizePlainText(body.reason, 1000) : null;

    if (!order_number || !customer_name || !customer_email || !order_date || !items_summary || !bank_account) {
      return jsonResponse({ success: false, error: 'Please fill in all mandatory fields.' }, 400);
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer_email)) {
      return jsonResponse({ success: false, error: 'Please provide a valid email address.' }, 400);
    }

    const newRecord = {
      id: crypto.randomUUID(),
      order_number,
      customer_name,
      customer_email,
      customer_phone,
      order_date,
      items_summary,
      bank_account,
      reason,
      status: 'pending',
      admin_notes: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    let insertedId = newRecord.id;

    // Try direct insert into store_withdrawals table
    const { data: dbData, error: dbErr } = await supabaseAdmin
      .from('store_withdrawals')
      .insert(newRecord)
      .select('id')
      .maybeSingle();

    if (dbErr) {
      console.warn('Direct store_withdrawals table insert failed, using fallback:', dbErr.message);
      await fallbackSaveWithdrawal(newRecord);
    } else if (dbData?.id) {
      insertedId = dbData.id;
    }

    // Trigger notification email (async, non-blocking)
    void sendNotificationEmail(newRecord);

    return jsonResponse({
      success: true,
      id: insertedId,
      message: 'Withdrawal declaration recorded successfully.',
    }, 201);
  } catch (err: any) {
    console.error('Error handling withdrawal request:', err);
    return jsonResponse({ success: false, error: err.message || 'Server error.' }, 500);
  }
};

export const GET: APIRoute = async ({ request }) => {
  const caller = await getRequestUser(request);
  if (!caller?.isAdmin) {
    return jsonResponse({ success: false, error: 'Unauthorized.' }, 403);
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('store_withdrawals')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('store_withdrawals query failed, using fallback:', error.message);
      const fallbackList = await fallbackGetWithdrawals();
      return jsonResponse({ success: true, withdrawals: fallbackList });
    }

    return jsonResponse({ success: true, withdrawals: data || [] });
  } catch (err: any) {
    console.error('Error fetching withdrawals:', err);
    const fallbackList = await fallbackGetWithdrawals();
    return jsonResponse({ success: true, withdrawals: fallbackList });
  }
};

export const PATCH: APIRoute = async ({ request }) => {
  const caller = await getRequestUser(request);
  if (!caller?.isAdmin) {
    return jsonResponse({ success: false, error: 'Unauthorized.' }, 403);
  }

  try {
    const body = await request.json().catch(() => null);
    if (!body?.id) {
      return jsonResponse({ success: false, error: 'Missing withdrawal ID.' }, 400);
    }

    const updates: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (body.status) {
      if (!VALID_STATUSES.includes(body.status)) {
        return jsonResponse({ success: false, error: 'Invalid status.' }, 400);
      }
      updates.status = body.status;
    }

    if (body.admin_notes !== undefined) {
      updates.admin_notes = sanitizePlainText(body.admin_notes, 2000) || null;
    }

    const { error } = await supabaseAdmin
      .from('store_withdrawals')
      .update(updates)
      .eq('id', body.id);

    if (error) {
      console.warn('store_withdrawals update failed, using fallback:', error.message);
      await fallbackUpdateWithdrawal(body.id, updates);
    }

    return jsonResponse({ success: true });
  } catch (err: any) {
    console.error('Error updating withdrawal:', err);
    return jsonResponse({ success: false, error: err.message || 'Server error.' }, 500);
  }
};
