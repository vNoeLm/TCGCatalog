import type { APIRoute } from 'astro';
import { supabaseAdmin } from '../../../lib/supabaseServer';
import { getRequestUser, jsonResponse } from '../../../lib/requestAuth';

export const prerender = false;

const BANNERS_KEY = 'user_banners';
const DISPLAYED_BADGES_KEY = 'user_displayed_badges';
const ALLOWED_BADGE_GAMES = new Set(['riftbound', 'mtg', 'onepiece']);

async function loadBannersMap(): Promise<Record<string, string>> {
  try {
    const { data } = await supabaseAdmin
      .from('settings')
      .select('value')
      .eq('key', BANNERS_KEY)
      .maybeSingle();
    if (data?.value) {
      const parsed = JSON.parse(data.value);
      if (parsed && typeof parsed === 'object') return parsed;
    }
  } catch {}
  return {};
}

async function saveBannersMap(map: Record<string, string>): Promise<void> {
  await supabaseAdmin
    .from('settings')
    .upsert({ key: BANNERS_KEY, value: JSON.stringify(map) });
}

async function loadDisplayedBadgesMap(): Promise<Record<string, string[]>> {
  try {
    const { data } = await supabaseAdmin
      .from('settings')
      .select('value')
      .eq('key', DISPLAYED_BADGES_KEY)
      .maybeSingle();
    if (data?.value) {
      const parsed = JSON.parse(data.value);
      if (parsed && typeof parsed === 'object') return parsed;
    }
  } catch {}
  return {};
}

async function saveDisplayedBadgesMap(map: Record<string, string[]>): Promise<void> {
  await supabaseAdmin
    .from('settings')
    .upsert({ key: DISPLAYED_BADGES_KEY, value: JSON.stringify(map) });
}

function parseBlur(bannerUrl?: string | null): number {
  if (!bannerUrl) return 0;
  const hashIdx = bannerUrl.indexOf('#blur=');
  if (hashIdx === -1) return 0;
  const num = parseInt(bannerUrl.slice(hashIdx + 6), 10);
  return isNaN(num) ? 0 : Math.max(0, Math.min(100, num));
}

// GET /api/profile?id=<userId>
export const GET: APIRoute = async ({ url }) => {
  const userId = url.searchParams.get('id')?.trim();
  if (!userId) return jsonResponse({ success: false, error: 'Missing id' }, 400);

  const [{ data: profile }, banners, badgesMap] = await Promise.all([
    supabaseAdmin
      .from('profiles')
      .select('id, display_name, avatar_url, role, is_admin')
      .eq('id', userId)
      .maybeSingle(),
    loadBannersMap(),
    loadDisplayedBadgesMap(),
  ]);

  const rawBanner = banners[userId] || null;
  const displayedBadges = Array.isArray(badgesMap[userId])
    ? badgesMap[userId].filter((g) => ALLOWED_BADGE_GAMES.has(g))
    : ['riftbound'];

  return jsonResponse({
    success: true,
    id: userId,
    display_name: profile?.display_name || null,
    avatar_url: profile?.avatar_url || null,
    banner_url: rawBanner,
    banner_blur: parseBlur(rawBanner),
    displayed_badges: displayedBadges,
  });
};

// PATCH /api/profile { display_name?, avatar_url?, banner_url?, displayed_badges? }
export const PATCH: APIRoute = async ({ request }) => {
  const caller = await getRequestUser(request);
  if (!caller) return jsonResponse({ success: false, error: 'Unauthorized' }, 401);

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return jsonResponse({ success: false, error: 'Invalid request body' }, 400);
  }

  const userId = caller.user.id;
  const profilePatch: Record<string, any> = {};
  const metaPatch: Record<string, any> = { ...(caller.user.user_metadata || {}) };

  if (body.display_name !== undefined) {
    const name = String(body.display_name || '').trim().slice(0, 50);
    if (!name) return jsonResponse({ success: false, error: 'Display name cannot be empty.' }, 400);
    profilePatch.display_name = name;
    metaPatch.display_name = name;
    metaPatch.full_name = name;
    metaPatch.name = name;
  }

  if (body.avatar_url !== undefined) {
    const avatarUrl = body.avatar_url ? String(body.avatar_url).trim().slice(0, 500) : null;
    profilePatch.avatar_url = avatarUrl;
    metaPatch.avatar_url = avatarUrl;
  }

  if (body.banner_url !== undefined) {
    const bannerUrl = body.banner_url ? String(body.banner_url).trim().slice(0, 500) : null;
    metaPatch.banner_url = bannerUrl;
    const banners = await loadBannersMap();
    if (bannerUrl) {
      banners[userId] = bannerUrl;
    } else {
      delete banners[userId];
    }
    await saveBannersMap(banners);
  }

  if (Array.isArray(body.displayed_badges)) {
    const cleaned: string[] = Array.from(
      new Set<string>(
        body.displayed_badges
          .map((g: unknown) => String(g || '').toLowerCase())
          .filter((g: string) => ALLOWED_BADGE_GAMES.has(g))
      )
    );
    metaPatch.displayed_badges = cleaned;
    const badgesMap = await loadDisplayedBadgesMap();
    badgesMap[userId] = cleaned;
    await saveDisplayedBadgesMap(badgesMap);
  }

  if (Object.keys(profilePatch).length > 0) {
    await supabaseAdmin
      .from('profiles')
      .upsert({ id: userId, ...profilePatch }, { onConflict: 'id' });
  }

  await supabaseAdmin.auth.admin.updateUserById(userId, {
    user_metadata: metaPatch,
  });

  return jsonResponse({
    success: true,
    display_name: profilePatch.display_name ?? metaPatch.display_name ?? null,
    avatar_url: profilePatch.avatar_url !== undefined ? profilePatch.avatar_url : (metaPatch.avatar_url ?? null),
    banner_url: metaPatch.banner_url ?? null,
    displayed_badges: metaPatch.displayed_badges ?? undefined,
  });
};

// POST /api/profile { dataUrl } -> uploads a tiny client-compressed 160x160 WebP avatar (~8 KB)
export const POST: APIRoute = async ({ request }) => {
  const caller = await getRequestUser(request);
  if (!caller) return jsonResponse({ success: false, error: 'Unauthorized' }, 401);

  const body = await request.json().catch(() => null);
  const dataUrl = typeof body?.dataUrl === 'string' ? body.dataUrl : '';
  const match = dataUrl.match(/^data:(image\/(?:webp|jpeg|png));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) {
    return jsonResponse({ success: false, error: 'Invalid image format. Please upload a PNG, JPG, or WebP image.' }, 400);
  }

  const contentType = match[1];
  const base64 = match[2];
  const buffer = Buffer.from(base64, 'base64');

  // Strict 80 KB server cap so avatars never bloat storage
  if (buffer.byteLength > 80 * 1024) {
    return jsonResponse({ success: false, error: 'Compressed avatar is too large (max 80 KB).' }, 400);
  }

  const ext = contentType === 'image/png' ? 'png' : contentType === 'image/jpeg' ? 'jpg' : 'webp';
  const filePath = `avatars/${caller.user.id}.${ext}`;

  const { error: uploadErr } = await supabaseAdmin.storage
    .from('card-images')
    .upload(filePath, buffer, {
      contentType,
      upsert: true,
      cacheControl: '3600',
    });

  if (uploadErr) {
    return jsonResponse({ success: false, error: uploadErr.message || 'Storage upload failed.' }, 500);
  }

  const { data: pub } = supabaseAdmin.storage.from('card-images').getPublicUrl(filePath);
  const avatarUrl = `${pub.publicUrl}?v=${Date.now()}`;

  const metaPatch = {
    ...(caller.user.user_metadata || {}),
    avatar_url: avatarUrl,
  };

  await Promise.all([
    supabaseAdmin.from('profiles').upsert({ id: caller.user.id, avatar_url: avatarUrl }, { onConflict: 'id' }),
    supabaseAdmin.auth.admin.updateUserById(caller.user.id, { user_metadata: metaPatch }),
  ]);

  return jsonResponse({ success: true, avatar_url: avatarUrl });
};
