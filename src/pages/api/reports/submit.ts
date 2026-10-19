import type { APIRoute } from 'astro';
import { supabaseAdmin } from '../../../lib/supabaseServer';
import { getRequestUser, jsonResponse } from '../../../lib/requestAuth';

export const prerender = false;

export interface ModerationReport {
  id: string;
  type: 'listing' | 'profile' | 'message';
  target_id: string;
  target_name: string;
  target_link: string;
  reason: string;
  details?: string;
  reporter_id?: string | null;
  reporter_name?: string;
  status: 'pending' | 'resolved' | 'dismissed';
  created_at: string;
  resolved_at?: string;
  resolved_by?: string;
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const auth = await getRequestUser(request);
    const user = auth?.user || null;
    const body = await request.json().catch(() => null);

    if (!body || !body.type || !body.target_id || !body.reason) {
      return jsonResponse({ success: false, error: 'Missing required report fields (type, target_id, reason).' }, 400);
    }

    const validTypes = ['listing', 'profile', 'message'];
    if (!validTypes.includes(body.type)) {
      return jsonResponse({ success: false, error: 'Invalid report type.' }, 400);
    }

    let reporterName = 'Anonymous Collector';
    if (user) {
      const { data: prof } = await supabaseAdmin.from('profiles').select('display_name').eq('id', user.id).maybeSingle();
      reporterName = prof?.display_name || user.user_metadata?.display_name || user.email || 'Collector';
    }

    const newReport: ModerationReport = {
      id: `rep_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      type: body.type,
      target_id: String(body.target_id).slice(0, 100),
      target_name: String(body.target_name || body.target_id).slice(0, 150),
      target_link: String(body.target_link || '').slice(0, 300),
      reason: String(body.reason).slice(0, 100),
      details: body.details ? String(body.details).slice(0, 1000) : undefined,
      reporter_id: user?.id || null,
      reporter_name: reporterName,
      status: 'pending',
      created_at: new Date().toISOString(),
    };

    // Load existing reports from settings key 'moderation_reports'
    const { data: settingsRow } = await supabaseAdmin.from('settings').select('value').eq('key', 'moderation_reports').maybeSingle();
    let existingReports: ModerationReport[] = [];
    if (settingsRow?.value) {
      try {
        const parsed = typeof settingsRow.value === 'string' ? JSON.parse(settingsRow.value) : settingsRow.value;
        if (Array.isArray(parsed)) existingReports = parsed;
      } catch {
        existingReports = [];
      }
    }

    existingReports.unshift(newReport);
    // Keep up to 500 reports
    if (existingReports.length > 500) {
      existingReports = existingReports.slice(0, 500);
    }

    await supabaseAdmin.from('settings').upsert({
      key: 'moderation_reports',
      value: JSON.stringify(existingReports),
    });

    return jsonResponse({ success: true, report: newReport });
  } catch (err: any) {
    console.error('Error submitting report:', err);
    return jsonResponse({ success: false, error: err.message || 'Internal server error.' }, 500);
  }
};
