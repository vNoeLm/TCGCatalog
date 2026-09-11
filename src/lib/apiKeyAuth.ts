import { supabaseAdmin } from './supabaseServer';
import crypto from 'crypto';

export interface ApiKeyItem {
  id: string;
  key: string;
  name: string;
  created_at: string;
  is_active: boolean;
  requests_count: number;
  last_used_at: string | null;
}

export interface ApiSettings {
  require_key: boolean;
  keys: ApiKeyItem[];
}

const DEFAULT_KEY: ApiKeyItem = {
  id: 'key_default_demo_2026',
  key: 'tcg_live_tcgvault_demo_2026',
  name: 'Classroom Demo Key',
  created_at: new Date().toISOString(),
  is_active: true,
  requests_count: 0,
  last_used_at: null,
};

let _cache: { data: ApiSettings; timestamp: number } | null = null;
const CACHE_TTL_MS = 15000; // 15 second in-memory cache for high performance

export async function getApiSettings(bypassCache = false): Promise<ApiSettings> {
  const now = Date.now();
  if (!bypassCache && _cache && now - _cache.timestamp < CACHE_TTL_MS) {
    return _cache.data;
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('settings')
      .select('key, value')
      .in('key', ['api_require_key', 'api_keys']);

    if (error) {
      console.error('[apiKeyAuth] Error fetching API settings:', error);
      return { require_key: true, keys: [DEFAULT_KEY] };
    }

    let requireKey = true;
    let keys: ApiKeyItem[] = [];

    (data || []).forEach(row => {
      if (row.key === 'api_require_key') {
        requireKey = row.value !== 'false';
      }
      if (row.key === 'api_keys') {
        try {
          keys = JSON.parse(row.value);
        } catch (e) {
          keys = [];
        }
      }
    });

    // Auto-seed default demo key if none exist
    if (!keys || keys.length === 0) {
      keys = [DEFAULT_KEY];
      await supabaseAdmin.from('settings').upsert([
        { key: 'api_keys', value: JSON.stringify(keys), updated_at: new Date().toISOString() },
        { key: 'api_require_key', value: 'true', updated_at: new Date().toISOString() }
      ]);
    }

    const settings: ApiSettings = { require_key: requireKey, keys };
    _cache = { data: settings, timestamp: now };
    return settings;
  } catch (err) {
    console.error('[apiKeyAuth] Unexpected error:', err);
    return { require_key: true, keys: [DEFAULT_KEY] };
  }
}

export function clearApiSettingsCache() {
  _cache = null;
}

export async function createApiKey(name: string): Promise<ApiKeyItem> {
  const settings = await getApiSettings(true);
  const randomHex = crypto.randomBytes(12).toString('hex');
  const newKey: ApiKeyItem = {
    id: 'key_' + crypto.randomUUID().slice(0, 8),
    key: 'tcg_live_' + randomHex,
    name: (name || 'Classroom Key').trim(),
    created_at: new Date().toISOString(),
    is_active: true,
    requests_count: 0,
    last_used_at: null,
  };

  const updatedKeys = [newKey, ...settings.keys];
  await supabaseAdmin.from('settings').upsert({
    key: 'api_keys',
    value: JSON.stringify(updatedKeys),
    updated_at: new Date().toISOString(),
  });

  clearApiSettingsCache();
  return newKey;
}

export async function toggleApiKeyStatus(keyId: string, isActive: boolean): Promise<boolean> {
  const settings = await getApiSettings(true);
  const updatedKeys = settings.keys.map(k => k.id === keyId ? { ...k, is_active: isActive } : k);
  
  await supabaseAdmin.from('settings').upsert({
    key: 'api_keys',
    value: JSON.stringify(updatedKeys),
    updated_at: new Date().toISOString(),
  });

  clearApiSettingsCache();
  return true;
}

export async function deleteApiKey(keyId: string): Promise<boolean> {
  const settings = await getApiSettings(true);
  const updatedKeys = settings.keys.filter(k => k.id !== keyId);

  await supabaseAdmin.from('settings').upsert({
    key: 'api_keys',
    value: JSON.stringify(updatedKeys),
    updated_at: new Date().toISOString(),
  });

  clearApiSettingsCache();
  return true;
}

export async function setApiRequireKey(requireKey: boolean): Promise<boolean> {
  await supabaseAdmin.from('settings').upsert({
    key: 'api_require_key',
    value: requireKey ? 'true' : 'false',
    updated_at: new Date().toISOString(),
  });

  clearApiSettingsCache();
  return true;
}

export function extractApiKeyFromRequest(request: Request): string | null {
  // 1. Check x-api-key header
  const xApiKey = request.headers.get('x-api-key');
  if (xApiKey && xApiKey.trim()) return xApiKey.trim();

  // 2. Check Authorization: Bearer <key>
  const authHeader = request.headers.get('authorization');
  if (authHeader) {
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (match && match[1]?.trim()) {
      return match[1].trim();
    }
  }

  // 3. Check query param: ?api_key=<key>
  try {
    const url = new URL(request.url);
    const queryKey = url.searchParams.get('api_key') || url.searchParams.get('apikey') || url.searchParams.get('key');
    if (queryKey && queryKey.trim()) return queryKey.trim();
  } catch (e) {}

  return null;
}

export interface AuthValidationResult {
  valid: boolean;
  keyData?: ApiKeyItem | null;
  error?: string;
  statusCode?: number;
}

export async function validateApiKey(request: Request): Promise<AuthValidationResult> {
  const settings = await getApiSettings();

  // If public mode is enabled by admin, allow request through
  if (!settings.require_key) {
    const provided = extractApiKeyFromRequest(request);
    const matched = provided ? settings.keys.find(k => k.key === provided && k.is_active) : null;
    return { valid: true, keyData: matched || null };
  }

  const providedKey = extractApiKeyFromRequest(request);
  if (!providedKey) {
    return {
      valid: false,
      statusCode: 401,
      error: "Authentication required: Missing API key. Please provide your key via the 'x-api-key' header, 'Authorization: Bearer <key>', or '?api_key=<key>' query parameter. View documentation at /api-docs.",
    };
  }

  const matched = settings.keys.find(k => k.key === providedKey);
  if (!matched) {
    return {
      valid: false,
      statusCode: 401,
      error: "Authentication failed: Invalid API key. Please check your key or request one from your instructor/administrator. View documentation at /api-docs.",
    };
  }

  if (!matched.is_active) {
    return {
      valid: false,
      statusCode: 403,
      error: "Access denied: This API key has been deactivated or revoked by the administrator.",
    };
  }

  return { valid: true, keyData: matched };
}
