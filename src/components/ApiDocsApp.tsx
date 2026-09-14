import React, { useState, useEffect, useMemo } from 'react';
import { getCurrentProfile } from '../lib/auth';
import { ApiKeysPanel } from './admin/ApiKeysPanel';
import type { UserProfile } from '../types';

type EndpointKey = 'cards' | 'card_by_id' | 'sets' | 'set_by_id' | 'random' | 'root';
type CodeLang = 'csharp' | 'js' | 'py' | 'curl';

interface EndpointMeta {
  key: EndpointKey;
  name: string;
  method: 'GET';
  path: string;
  summary: string;
  description: string;
  defaultParams: Record<string, string>;
  paramDocs: { name: string; type: string; required: boolean; description: string; example: string }[];
  presets: { label: string; params: Record<string, string> }[];
}

const ENDPOINTS: EndpointMeta[] = [
  {
    key: 'cards',
    name: 'List & Search Cards',
    method: 'GET',
    path: '/api/v1/cards',
    summary: 'Search and paginate through cards with rich multi-game filters.',
    description: 'Returns a paginated array of cards matching your search query, game, expansion set, rarity, card type, domain, and resource cost filters.',
    defaultParams: {
      game: 'riftbound',
      limit: '5',
      page: '1',
      rarity: '',
      type: '',
      domain: '',
      cost: '',
      min_cost: '',
      max_cost: '',
      search: '',
      sort: 'card_number:asc',
    },
    paramDocs: [
      { name: 'game', type: 'string', required: false, description: 'Filter by game (riftbound or cyberpunk)', example: 'riftbound' },
      { name: 'set', type: 'string', required: false, description: 'Filter by set code (OGN, VEN, SPI, UNL, etc.) or set UUID', example: 'OGN' },
      { name: 'search', type: 'string', required: false, description: 'Search text matching card name, number, artist, or rules text', example: 'Dragon' },
      { name: 'rarity', type: 'string', required: false, description: 'Rarity: Common, Uncommon, Rare, Epic, Secret, Nova Rare, Showcase', example: 'Rare' },
      { name: 'type', type: 'string', required: false, description: 'Card type: Spell, Unit, Battlefield, Rune, Gear, Legend, Program', example: 'Spell' },
      { name: 'domain', type: 'string', required: false, description: 'Card domain/element (Fury, Calm, Mind, Chaos, Order, Body)', example: 'Fury' },
      { name: 'cost', type: 'number', required: false, description: 'Exact resource cost', example: '3' },
      { name: 'min_cost', type: 'number', required: false, description: 'Minimum cost filter', example: '1' },
      { name: 'max_cost', type: 'number', required: false, description: 'Maximum cost filter', example: '5' },
      { name: 'sort', type: 'string', required: false, description: 'Field and direction (card_number:asc, name:asc, cost:desc)', example: 'cost:desc' },
      { name: 'page', type: 'number', required: false, description: 'Page number for pagination (starts at 1)', example: '1' },
      { name: 'limit', type: 'number', required: false, description: 'Number of results per page (1 to 100, default 20)', example: '10' },
    ],
    presets: [
      {
        label: '5 Origins Cards',
        params: { game: 'riftbound', set: 'OGN', limit: '5', sort: 'card_number:asc' },
      },
      {
        label: 'Showcase Alt-Art Runes',
        params: { game: 'riftbound', rarity: 'Showcase', type: 'Rune', limit: '6', sort: 'card_number:asc' },
      },
      {
        label: 'High-Cost Spells (Cost ≥ 4)',
        params: { game: 'riftbound', type: 'Spell', min_cost: '4', sort: 'cost:desc', limit: '5' },
      },
      {
        label: 'Cyberpunk Rare Cards',
        params: { game: 'cyberpunk', rarity: 'Rare', limit: '5', sort: 'card_number:asc' },
      },
      {
        label: 'Search "Dragon"',
        params: { search: 'Dragon', limit: '5', sort: 'name:asc' },
      },
    ],
  },
  {
    key: 'card_by_id',
    name: 'Get Card by ID or Code',
    method: 'GET',
    path: '/api/v1/cards/{id_or_number}',
    summary: 'Lookup a single card by database UUID or public card number.',
    description: 'Retrieves complete metadata, artist details, set information, and high-resolution CDN image URL for a single card. Supports UUIDs and public card numbers.',
    defaultParams: {
      id_or_number: 'OGN-001/298',
    },
    paramDocs: [
      { name: 'id_or_number', type: 'string (path)', required: true, description: 'Database UUID or public card code (URL encoded)', example: 'OGN-001/298' },
    ],
    presets: [
      { label: 'Origins #001 (OGN-001/298)', params: { id_or_number: 'OGN-001/298' } },
      { label: 'Vendetta Rune (VEN-R01)', params: { id_or_number: 'VEN-R01' } },
      { label: 'Alt-Art Showcase Rune (OGN-007a/298)', params: { id_or_number: 'OGN-007a/298' } },
      { label: 'Cyberpunk Mantis Blades (025)', params: { id_or_number: '025' } },
    ],
  },
  {
    key: 'sets',
    name: 'List Expansion Sets',
    method: 'GET',
    path: '/api/v1/sets',
    summary: 'Retrieve all expansion sets, promo releases, and starter decks.',
    description: 'Returns an array of all official expansion sets across Riftbound and Cyberpunk, with release dates and total card counts.',
    defaultParams: {
      game: '',
    },
    paramDocs: [
      { name: 'game', type: 'string', required: false, description: 'Optional game filter (riftbound or cyberpunk)', example: 'riftbound' },
    ],
    presets: [
      { label: 'All Sets (Both Games)', params: { game: '' } },
      { label: 'Riftbound Sets Only', params: { game: 'riftbound' } },
      { label: 'Cyberpunk Sets Only', params: { game: 'cyberpunk' } },
    ],
  },
  {
    key: 'set_by_id',
    name: 'Get Set by Code or ID',
    method: 'GET',
    path: '/api/v1/sets/{id_or_code}',
    summary: 'Lookup details for a specific set by code or UUID.',
    description: 'Retrieves full set metadata, code, release date, and active catalog card count.',
    defaultParams: {
      id_or_code: 'OGN',
    },
    paramDocs: [
      { name: 'id_or_code', type: 'string (path)', required: true, description: 'Set code (OGN, SPI, UNL, VEN, etc.) or set UUID', example: 'OGN' },
    ],
    presets: [
      { label: 'Origins (OGN)', params: { id_or_code: 'OGN' } },
      { label: 'Vendetta (VEN)', params: { id_or_code: 'VEN' } },
      { label: 'Spiritforged (SPI)', params: { id_or_code: 'SPI' } },
      { label: 'Cyberpunk Retail (welcometonightcityretail)', params: { id_or_code: 'welcometonightcityretail' } },
    ],
  },
  {
    key: 'random',
    name: 'Random Card Generator',
    method: 'GET',
    path: '/api/v1/random',
    summary: 'Fetch 1 or more random cards matching optional criteria.',
    description: 'Useful for card draw mechanics, pack opening simulators, featured card widgets, and deck generation applications.',
    defaultParams: {
      count: '3',
      game: 'riftbound',
      rarity: '',
      type: '',
      domain: '',
    },
    paramDocs: [
      { name: 'count', type: 'number', required: false, description: 'Number of random cards to draw (1 to 10, default 1)', example: '3' },
      { name: 'game', type: 'string', required: false, description: 'Limit to game (riftbound or cyberpunk)', example: 'riftbound' },
      { name: 'rarity', type: 'string', required: false, description: 'Limit to rarity (Common, Uncommon, Rare, Epic, Secret, Showcase)', example: 'Epic' },
      { name: 'type', type: 'string', required: false, description: 'Limit to card type (Spell, Unit, Battlefield, Rune, Legend, Gear)', example: 'Spell' },
      { name: 'domain', type: 'string', required: false, description: 'Limit to domain (Fury, Mind, Calm, etc.)', example: 'Fury' },
    ],
    presets: [
      { label: '3 Random Riftbound Cards', params: { count: '3', game: 'riftbound' } },
      { label: '1 Random Epic Card', params: { count: '1', rarity: 'Epic' } },
      { label: '1 Random Showcase Card', params: { count: '1', rarity: 'Showcase', game: 'riftbound' } },
      { label: '4 Random Spells', params: { count: '4', type: 'Spell', game: 'riftbound' } },
      { label: '3 Random Cyberpunk Legends', params: { count: '3', game: 'cyberpunk', type: 'Legend' } },
    ],
  },
  {
    key: 'root',
    name: 'API Overview & Root Sitemap',
    method: 'GET',
    path: '/api/v1',
    summary: 'API root information, version, sitemap, and live statistics.',
    description: 'Returns real-time server metadata, total card counts, total sets, available endpoints, and key authentication status.',
    defaultParams: {},
    paramDocs: [],
    presets: [
      { label: 'Inspect API Root', params: {} },
    ],
  },
];

export function ApiDocsApp() {
  const [apiKey, setApiKey] = useState<string>('tcg_live_tcgvault_demo_2026');
  const [selectedEndpointKey, setSelectedEndpointKey] = useState<EndpointKey>('cards');
  const [activeTab, setActiveTab] = useState<'tester' | 'docs' | 'code' | 'guides' | 'keys'>('tester');
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const isOwner = Boolean(profile?.is_owner || profile?.role === 'owner' || profile?.email === 'vnoel05@gmail.com');

  useEffect(() => {
    getCurrentProfile().then(setProfile);
  }, []);
  const [selectedLang, setSelectedLang] = useState<CodeLang>('csharp');
  const [authMethod, setAuthMethod] = useState<'header' | 'bearer' | 'query'>('header');

  const [paramValues, setParamValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState<boolean>(false);
  const [responseStatus, setResponseStatus] = useState<number | null>(null);
  const [responseTime, setResponseTime] = useState<number | null>(null);
  const [responseData, setResponseData] = useState<any | null>(null);

  const [copiedKey, setCopiedKey] = useState<boolean>(false);
  const [copiedSnippet, setCopiedSnippet] = useState<boolean>(false);
  const [copiedResponse, setCopiedResponse] = useState<boolean>(false);

  const selectedEndpoint = useMemo(() => {
    return ENDPOINTS.find(e => e.key === selectedEndpointKey) || ENDPOINTS[0];
  }, [selectedEndpointKey]);

  // Sync default params on endpoint switch
  useEffect(() => {
    setParamValues({ ...selectedEndpoint.defaultParams });
    setResponseStatus(null);
    setResponseTime(null);
    setResponseData(null);
  }, [selectedEndpointKey]);

  // Load saved API key from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('tcg_vault_student_api_key');
      if (saved && saved.trim()) setApiKey(saved.trim());
    } catch (e) {}
  }, []);

  const handleKeyChange = (val: string) => {
    setApiKey(val);
    try {
      localStorage.setItem('tcg_vault_student_api_key', val);
    } catch (e) {}
  };

  const handleCopyKey = () => {
    navigator.clipboard.writeText(apiKey);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  // Clean preset applicator: clears all other fields to avoid ghost filters
  const applyPreset = (presetParams: Record<string, string>) => {
    const clean: Record<string, string> = {};
    selectedEndpoint.paramDocs.forEach(p => {
      clean[p.name] = '';
    });
    setParamValues({ ...clean, ...presetParams });
  };

  // Compute URL
  const { requestUrl, displayUrl } = useMemo(() => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    let path = selectedEndpoint.path;

    if (selectedEndpoint.key === 'card_by_id') {
      const idVal = encodeURIComponent(paramValues.id_or_number || 'OGN-001/298');
      path = `/api/v1/cards/${idVal}`;
    } else if (selectedEndpoint.key === 'set_by_id') {
      const setVal = encodeURIComponent(paramValues.id_or_code || 'OGN');
      path = `/api/v1/sets/${setVal}`;
    }

    const queryPairs: string[] = [];
    Object.entries(paramValues).forEach(([k, v]) => {
      if (k === 'id_or_number' || k === 'id_or_code') return;
      if (v && v.trim()) {
        queryPairs.push(`${encodeURIComponent(k)}=${encodeURIComponent(v.trim())}`);
      }
    });

    if (authMethod === 'query' && apiKey.trim()) {
      queryPairs.push(`api_key=${encodeURIComponent(apiKey.trim())}`);
    }

    const queryString = queryPairs.length > 0 ? `?${queryPairs.join('&')}` : '';
    const fullPath = `${path}${queryString}`;
    return {
      requestUrl: `${origin}${fullPath}`,
      displayUrl: fullPath,
    };
  }, [selectedEndpoint, paramValues, authMethod, apiKey]);

  // Execute request
  const handleSendRequest = async () => {
    setLoading(true);
    setResponseStatus(null);
    setResponseTime(null);
    setResponseData(null);

    const headers: Record<string, string> = {};
    if (authMethod === 'header' && apiKey.trim()) {
      headers['x-api-key'] = apiKey.trim();
    } else if (authMethod === 'bearer' && apiKey.trim()) {
      headers['Authorization'] = `Bearer ${apiKey.trim()}`;
    }

    const start = performance.now();
    try {
      const res = await fetch(requestUrl, { headers });
      const elapsed = Math.round(performance.now() - start);
      setResponseTime(elapsed);
      setResponseStatus(res.status);

      const json = await res.json();
      setResponseData(json);
    } catch (err: any) {
      const elapsed = Math.round(performance.now() - start);
      setResponseTime(elapsed);
      setResponseStatus(0);
      setResponseData({ error: 'Network Error or Server Unreachable: ' + (err?.message || 'Unknown error') });
    } finally {
      setLoading(false);
    }
  };

  // Generate Code Snippets (C#, JS, Python, cURL)
  const codeSnippet = useMemo(() => {
    const keyStr = apiKey.trim() || 'YOUR_API_KEY';
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://tcgvault.hu';
    const cleanUrl = `${origin}${displayUrl}`;

    // 1. C# (HttpClient)
    if (selectedLang === 'csharp') {
      if (authMethod === 'query') {
        return `// C# (.NET 6+) using HttpClient (Query Parameter)
using System;
using System.Net.Http;
using System.Threading.Tasks;

class Program
{
    static async Task Main(string[] args)
    {
        using var client = new HttpClient();
        
        using var response = await client.GetAsync("${cleanUrl}");
        
        if (!response.IsSuccessStatusCode)
        {
            Console.WriteLine($"API Error: {(int)response.StatusCode} {response.ReasonPhrase}");
            string errorBody = await response.Content.ReadAsStringAsync();
            Console.WriteLine(errorBody);
            return;
        }

        string json = await response.Content.ReadAsStringAsync();
        Console.WriteLine(json);
    }
}`;
      }

      if (authMethod === 'bearer') {
        return `// C# (.NET 6+) using HttpClient (Authorization Bearer Header)
using System;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Threading.Tasks;

class Program
{
    static async Task Main(string[] args)
    {
        using var client = new HttpClient();
        
        using var request = new HttpRequestMessage(HttpMethod.Get, "${cleanUrl}");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", "${keyStr}");

        using var response = await client.SendAsync(request);
        
        if (!response.IsSuccessStatusCode)
        {
            Console.WriteLine($"API Error: {(int)response.StatusCode} {response.ReasonPhrase}");
            string errorBody = await response.Content.ReadAsStringAsync();
            Console.WriteLine(errorBody);
            return;
        }

        string json = await response.Content.ReadAsStringAsync();
        Console.WriteLine(json);
    }
}`;
      }

      return `// C# (.NET 6+) using HttpClient (x-api-key Header)
using System;
using System.Net.Http;
using System.Threading.Tasks;

class Program
{
    static async Task Main(string[] args)
    {
        using var client = new HttpClient();
        
        using var request = new HttpRequestMessage(HttpMethod.Get, "${cleanUrl}");
        request.Headers.Add("x-api-key", "${keyStr}");

        using var response = await client.SendAsync(request);
        
        if (!response.IsSuccessStatusCode)
        {
            Console.WriteLine($"API Error: {(int)response.StatusCode} {response.ReasonPhrase}");
            string errorBody = await response.Content.ReadAsStringAsync();
            Console.WriteLine(errorBody);
            return;
        }

        string json = await response.Content.ReadAsStringAsync();
        Console.WriteLine(json);
    }
}`;
    }

    // 2. JavaScript (fetch)
    if (selectedLang === 'js') {
      if (authMethod === 'query') {
        return `// JavaScript (fetch) using query parameter
async function fetchCardData() {
  const url = "${cleanUrl}";
  const response = await fetch(url);
  const data = await response.json();
  
  if (!response.ok) {
    console.error("API Error (" + response.status + "):", data.error);
    return;
  }
  
  console.log("Response data:", data);
}

fetchCardData();`;
      }

      const headerLine = authMethod === 'bearer'
        ? `      "Authorization": "Bearer ${keyStr}"`
        : `      "x-api-key": "${keyStr}"`;

      return `// JavaScript (fetch) using ${authMethod === 'bearer' ? 'Authorization Bearer header' : 'x-api-key header'}
async function fetchCardData() {
  const url = "${cleanUrl}";
  const response = await fetch(url, {
    method: "GET",
    headers: {
${headerLine}
    }
  });

  const data = await response.json();

  if (!response.ok) {
    console.error("API Error (" + response.status + "):", data.error);
    return;
  }

  console.log("Response data:", data);
}

fetchCardData();`;
    }

    // 3. Python (requests)
    if (selectedLang === 'py') {
      if (authMethod === 'query') {
        return `# Python 3 (requests) using query parameter
import requests

url = "${cleanUrl}"

try:
    response = requests.get(url)
    response.raise_for_status()
    data = response.json()
    print("API Response:", data)
except requests.exceptions.HTTPError as err:
    print("HTTP Error:", err, response.json())
except Exception as e:
    print("Error:", e)`;
      }

      const headerKey = authMethod === 'bearer' ? 'Authorization' : 'x-api-key';
      const headerVal = authMethod === 'bearer' ? `Bearer ${keyStr}` : keyStr;

      return `# Python 3 (requests) using ${headerKey} header
import requests

url = "${cleanUrl}"
headers = {
    "${headerKey}": "${headerVal}"
}

try:
    response = requests.get(url, headers=headers)
    response.raise_for_status()
    data = response.json()
    print("API Response:", data)
except requests.exceptions.HTTPError as err:
    print("HTTP Error:", err, response.json())
except Exception as e:
    print("Error:", e)`;
    }

    // 4. cURL
    if (authMethod === 'query') {
      return `curl -X GET "${cleanUrl}"`;
    }

    const headerArg = authMethod === 'bearer'
      ? `-H "Authorization: Bearer ${keyStr}"`
      : `-H "x-api-key: ${keyStr}"`;

    return `curl -X GET "${cleanUrl}" \\\n  ${headerArg}`;
  }, [selectedLang, authMethod, apiKey, displayUrl]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      {/* Header Banner */}
      <div className="mb-8 border-b pb-6" style={{ borderColor: 'var(--border)' }}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="px-2.5 py-0.5 text-[11px] font-black uppercase tracking-wider rounded-md border"
                    style={{ background: 'var(--accent-muted)', borderColor: 'var(--accent-border)', color: 'var(--accent)' }}>
                REST API v1
              </span>
              <span className="text-xs font-bold text-emerald-400 flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                Developer Hub
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black mt-2" style={{ color: 'var(--text-primary)' }}>
              TCG Vault Developer API Portal
            </h1>
            <p className="text-sm mt-1 max-w-2xl" style={{ color: 'var(--text-secondary)' }}>
              Card catalog REST API for Riftbound & Cyberpunk. Test live requests, inspect JSON payloads, and generate copyable integration code in C#, JavaScript, Python, and cURL.
            </p>
          </div>

          {/* Quick Links */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('guides')}
              className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl border transition cursor-pointer"
              style={{
                background: activeTab === 'guides' ? 'var(--accent-muted)' : 'var(--bg-surface-2)',
                borderColor: activeTab === 'guides' ? 'var(--accent)' : 'var(--border)',
                color: activeTab === 'guides' ? 'var(--text-accent)' : 'var(--text-secondary)',
              }}
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
              </svg>
              <span>API Architecture & Guides</span>
            </button>

            {isOwner && (
              <button
                type="button"
                onClick={() => setActiveTab('keys')}
                className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl border transition cursor-pointer"
                style={{
                  background: activeTab === 'keys' ? 'var(--accent-muted)' : 'var(--bg-surface-2)',
                  borderColor: activeTab === 'keys' ? 'var(--accent)' : 'var(--border)',
                  color: activeTab === 'keys' ? 'var(--text-accent)' : 'var(--text-secondary)',
                }}
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                <span>Manage API Keys</span>
              </button>
            )}
          </div>
        </div>

        {/* Global API Key Config Bar */}
        <div className="mt-5 p-4 rounded-xl border shadow-sm" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-amber-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 2l-2 2m-1-1l-3 3m2 2l-3 3m-2-2l-2 2m-1-1l-4 4a5 5 0 1 1-7-7l4-4" />
              </svg>
              <div>
                <div className="text-xs font-black uppercase tracking-wider text-zinc-300">API Authorization Key</div>
                <div className="text-[11px] text-zinc-400">Provide your API key to authenticate live requests and automatically inject credentials into code snippets.</div>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-1 max-w-xl">
              <input
                type="text"
                value={apiKey}
                onChange={(e) => handleKeyChange(e.target.value)}
                placeholder="tcg_live_..."
                className="w-full px-3 py-1.5 text-xs font-mono rounded-lg border focus:outline-none transition"
                style={{
                  background: 'var(--bg-surface-2)',
                  borderColor: apiKey ? 'var(--accent-border)' : 'var(--border)',
                  color: 'var(--text-primary)',
                }}
              />
              <button
                type="button"
                onClick={handleCopyKey}
                className="px-3 py-1.5 text-xs font-bold rounded-lg border transition cursor-pointer whitespace-nowrap"
                style={{ background: 'var(--bg-surface-2)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
              >
                {copiedKey ? 'Copied!' : 'Copy'}
              </button>
            </div>

            {/* Auth Format Selector */}
            <div className="flex items-center gap-1.5 text-[11px] font-bold text-zinc-400">
              <span>Send via:</span>
              <select
                value={authMethod}
                onChange={(e) => setAuthMethod(e.target.value as any)}
                className="px-2 py-1 text-xs rounded-lg border cursor-pointer focus:outline-none"
                style={{ background: 'var(--bg-surface-2)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              >
                <option value="header">x-api-key Header (Recommended)</option>
                <option value="bearer">Authorization: Bearer</option>
                <option value="query">URL ?api_key= (Query Param)</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Main Layout: Endpoints Sidebar + Content */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Sidebar: Endpoints List */}
        <div className="lg:col-span-4 space-y-2">
          <div className="text-[11px] font-black uppercase tracking-wider px-2 text-zinc-400">Endpoints Directory</div>
          <div className="space-y-1.5">
            {ENDPOINTS.map(ep => {
              const active = ep.key === selectedEndpointKey;
              return (
                <button
                  key={ep.key}
                  type="button"
                  onClick={() => setSelectedEndpointKey(ep.key)}
                  className="w-full text-left p-3 rounded-xl border transition cursor-pointer flex flex-col gap-1"
                  style={{
                    background: active ? 'var(--accent-muted)' : 'var(--bg-surface)',
                    borderColor: active ? 'var(--accent)' : 'var(--border)',
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold" style={{ color: active ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                      {ep.name}
                    </span>
                    <span className="text-[10px] font-black font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                      {ep.method}
                    </span>
                  </div>
                  <div className="text-[11px] font-mono truncate" style={{ color: 'var(--text-tertiary)' }}>
                    {ep.path}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Quick Notice Box */}
          <div className="p-3.5 rounded-xl border text-xs leading-relaxed mt-4" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
            <div className="font-black text-zinc-200 flex items-center gap-1.5 mb-1">
              <svg className="w-3.5 h-3.5 text-cyan-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="16" x2="12" y2="12" />
                <line x1="12" y1="8" x2="12.01" y2="8" />
              </svg>
              <span>Developer Notice</span>
            </div>
            <p className="text-zinc-400 text-[11px]">
              CORS is enabled with <code className="text-zinc-300">Access-Control-Allow-Origin: *</code>. You can query endpoints directly from browser single-page apps, mobile apps, or backend services without encountering preflight blocks.
            </p>
          </div>
        </div>

        {/* Content Pane: Live Playground / Docs / Code */}
        <div className="lg:col-span-8 space-y-6">
          
          {/* Endpoint Details Card */}
          <div className="p-5 rounded-2xl border" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 text-xs font-black font-mono rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                  {selectedEndpoint.method}
                </span>
                <span className="text-sm font-mono font-bold" style={{ color: 'var(--text-primary)' }}>
                  {selectedEndpoint.path}
                </span>
              </div>

              {/* Sub-tabs */}
              <div className="flex items-center gap-1 p-1 rounded-xl border text-xs font-bold" style={{ background: 'var(--bg-surface-2)', borderColor: 'var(--border)' }}>
                <button
                  type="button"
                  onClick={() => setActiveTab('tester')}
                  className={`px-3 py-1 rounded-lg transition cursor-pointer ${activeTab === 'tester' ? 'bg-[var(--accent)] text-zinc-950 font-black' : 'text-zinc-400 hover:text-zinc-200'}`}
                >
                  Live Tester
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('code')}
                  className={`px-3 py-1 rounded-lg transition cursor-pointer ${activeTab === 'code' ? 'bg-[var(--accent)] text-zinc-950 font-black' : 'text-zinc-400 hover:text-zinc-200'}`}
                >
                  Code Generator
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('docs')}
                  className={`px-3 py-1 rounded-lg transition cursor-pointer ${activeTab === 'docs' ? 'bg-[var(--accent)] text-zinc-950 font-black' : 'text-zinc-400 hover:text-zinc-200'}`}
                >
                  Parameters
                </button>
              </div>
            </div>

            <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              {selectedEndpoint.description}
            </p>

            {/* Presets Bar */}
            {selectedEndpoint.presets.length > 0 && (
              <div className="mt-4 pt-3 border-t flex flex-wrap items-center gap-1.5" style={{ borderColor: 'var(--border)' }}>
                <span className="text-[11px] font-bold text-zinc-400 mr-1">Presets:</span>
                {selectedEndpoint.presets.map((preset, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => applyPreset(preset.params)}
                    className="text-[11px] font-semibold px-2.5 py-1 rounded-lg border transition cursor-pointer hover:border-[var(--accent)]"
                    style={{ background: 'var(--bg-surface-2)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* TAB 1: Live Interactive Request Playground */}
          {activeTab === 'tester' && (
            <div className="space-y-4">
              {/* Parameters Input Form */}
              {selectedEndpoint.paramDocs.length > 0 && (
                <div className="p-4 rounded-xl border" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
                  <div className="text-xs font-black uppercase tracking-wider mb-3 text-zinc-300">Request Parameters</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {selectedEndpoint.paramDocs.map(p => (
                      <div key={p.name} className="space-y-1">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="font-mono font-bold" style={{ color: 'var(--text-primary)' }}>{p.name}</span>
                          <span className="text-zinc-500 font-mono text-[10px]">{p.type}</span>
                        </div>
                        <input
                          type="text"
                          value={paramValues[p.name] ?? ''}
                          onChange={(e) => setParamValues(prev => ({ ...prev, [p.name]: e.target.value }))}
                          placeholder={p.example ? `e.g. ${p.example}` : ''}
                          className="w-full px-2.5 py-1.5 text-xs rounded-lg border font-mono focus:outline-none"
                          style={{ background: 'var(--bg-surface-2)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Request URL Bar & Send Button */}
              <div className="p-4 rounded-xl border" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  <div className="flex-1 px-3 py-2 text-xs font-mono rounded-lg border overflow-x-auto whitespace-nowrap"
                       style={{ background: 'var(--bg-surface-2)', borderColor: 'var(--border)', color: 'var(--accent)' }}>
                    <span className="text-emerald-400 font-bold mr-2">GET</span>
                    {displayUrl}
                  </div>
                  <button
                    type="button"
                    onClick={handleSendRequest}
                    disabled={loading}
                    className="px-5 py-2 rounded-lg font-black text-xs transition cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
                    style={{ background: 'var(--accent)', color: 'var(--text-on-accent, #050505)' }}
                  >
                    {loading ? (
                      <>
                        <span className="w-3 h-3 border-2 border-zinc-950 border-t-transparent rounded-full animate-spin"></span>
                        <span>Sending…</span>
                      </>
                    ) : (
                      <>
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <polygon points="5 3 19 12 5 21 5 3" />
                        </svg>
                        <span>Send Request</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Live Response Panel */}
              {(responseStatus !== null || loading) && (
                <div className="p-4 rounded-xl border shadow-lg animate-fade-in" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-3 pb-3 border-b" style={{ borderColor: 'var(--border)' }}>
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-black uppercase tracking-wider text-zinc-300">Server Response</span>
                      {responseStatus !== null && (
                        <span className={`px-2 py-0.5 text-xs font-mono font-black rounded border ${
                          responseStatus >= 200 && responseStatus < 300
                            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                            : responseStatus === 401
                            ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                            : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                        }`}>
                          HTTP {responseStatus}
                        </span>
                      )}
                      {responseTime !== null && (
                        <span className="text-[11px] font-mono text-zinc-400">
                          {responseTime} ms
                        </span>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        if (responseData) {
                          navigator.clipboard.writeText(JSON.stringify(responseData, null, 2));
                          setCopiedResponse(true);
                          setTimeout(() => setCopiedResponse(false), 2000);
                        }
                      }}
                      className="px-2.5 py-1 text-xs font-bold rounded-lg border transition cursor-pointer"
                      style={{ background: 'var(--bg-surface-2)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                    >
                      {copiedResponse ? 'Copied JSON!' : 'Copy Response'}
                    </button>
                  </div>

                  {loading ? (
                    <div className="py-12 text-center text-zinc-400 text-xs animate-pulse">
                      Executing HTTP GET request…
                    </div>
                  ) : (
                    <pre className="p-3.5 rounded-lg border font-mono text-xs overflow-x-auto max-h-[420px] text-zinc-300"
                         style={{ background: '#090a0f', borderColor: 'var(--border)' }}>
                      {JSON.stringify(responseData, null, 2)}
                    </pre>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: Multi-Language Code Snippets (C#, JS, Python, cURL) */}
          {activeTab === 'code' && (
            <div className="p-5 rounded-2xl border space-y-4" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-1.5 p-1 rounded-xl border text-xs font-bold" style={{ background: 'var(--bg-surface-2)', borderColor: 'var(--border)' }}>
                  <button
                    type="button"
                    onClick={() => setSelectedLang('csharp')}
                    className={`px-3 py-1 rounded-lg transition cursor-pointer ${selectedLang === 'csharp' ? 'bg-[var(--accent)] text-zinc-950 font-black' : 'text-zinc-400 hover:text-zinc-200'}`}
                  >
                    C# (HttpClient)
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedLang('js')}
                    className={`px-3 py-1 rounded-lg transition cursor-pointer ${selectedLang === 'js' ? 'bg-[var(--accent)] text-zinc-950 font-black' : 'text-zinc-400 hover:text-zinc-200'}`}
                  >
                    JavaScript (fetch)
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedLang('py')}
                    className={`px-3 py-1 rounded-lg transition cursor-pointer ${selectedLang === 'py' ? 'bg-[var(--accent)] text-zinc-950 font-black' : 'text-zinc-400 hover:text-zinc-200'}`}
                  >
                    Python (requests)
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedLang('curl')}
                    className={`px-3 py-1 rounded-lg transition cursor-pointer ${selectedLang === 'curl' ? 'bg-[var(--accent)] text-zinc-950 font-black' : 'text-zinc-400 hover:text-zinc-200'}`}
                  >
                    cURL
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(codeSnippet);
                    setCopiedSnippet(true);
                    setTimeout(() => setCopiedSnippet(false), 2000);
                  }}
                  className="px-3.5 py-1.5 text-xs font-bold rounded-lg border transition cursor-pointer"
                  style={{ background: 'var(--bg-surface-2)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                >
                  {copiedSnippet ? 'Copied Code!' : 'Copy Snippet'}
                </button>
              </div>

              <pre className="p-4 rounded-xl border font-mono text-xs overflow-x-auto text-emerald-400 leading-relaxed"
                   style={{ background: '#090a0f', borderColor: 'var(--border)' }}>
                {codeSnippet}
              </pre>

              <div className="text-[11px] text-zinc-400 leading-relaxed">
                Note: This code snippet dynamically includes your configured endpoint, query parameters, and active API key.
              </div>
            </div>
          )}

          {/* TAB 3: Parameter Documentation */}
          {activeTab === 'docs' && (
            <div className="p-5 rounded-2xl border space-y-4" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
              <div className="text-xs font-black uppercase tracking-wider text-zinc-300">Supported Parameters</div>
              {selectedEndpoint.paramDocs.length === 0 ? (
                <div className="text-xs text-zinc-400 py-6 text-center">This endpoint does not accept any query parameters.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b" style={{ borderColor: 'var(--border)' }}>
                        <th className="py-2 font-black text-zinc-300">Name</th>
                        <th className="py-2 font-black text-zinc-300">Type</th>
                        <th className="py-2 font-black text-zinc-300">Required</th>
                        <th className="py-2 font-black text-zinc-300">Description</th>
                        <th className="py-2 font-black text-zinc-300">Example</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/40 font-mono">
                      {selectedEndpoint.paramDocs.map(p => (
                        <tr key={p.name}>
                          <td className="py-2.5 font-bold text-amber-400">{p.name}</td>
                          <td className="py-2.5 text-cyan-400">{p.type}</td>
                          <td className="py-2.5">
                            {p.required ? (
                              <span className="text-rose-400 font-bold">Required</span>
                            ) : (
                              <span className="text-zinc-500">Optional</span>
                            )}
                          </td>
                          <td className="py-2.5 font-sans text-zinc-300">{p.description}</td>
                          <td className="py-2.5 text-zinc-400">{p.example}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: API Architecture & Integration Guides */}
          {activeTab === 'guides' && (
            <div className="space-y-4">
              <div className="p-5 rounded-2xl border space-y-3" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
                <h3 className="text-sm font-black flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                  <svg className="w-4 h-4 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 14 14" />
                  </svg>
                  <span>1. Authentication & Header Security</span>
                </h3>
                <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                  Requests to the REST API can be authenticated using any of the following three standard delivery mechanisms:
                </p>
                <ul className="text-xs list-disc pl-5 space-y-1 text-zinc-400">
                  <li><strong className="text-zinc-200">Custom Header (Recommended):</strong> <code className="text-emerald-400">x-api-key: &lt;key&gt;</code>. Ideal for HTTP clients such as C# <code className="text-zinc-300">HttpClient</code>, Node <code className="text-zinc-300">fetch()</code>, and Python <code className="text-zinc-300">requests</code>.</li>
                  <li><strong className="text-zinc-200">Authorization Bearer:</strong> <code className="text-emerald-400">Authorization: Bearer &lt;key&gt;</code>. Compatible with standard OAuth2 / JWT client libraries.</li>
                  <li><strong className="text-zinc-200">URL Query Parameter:</strong> <code className="text-emerald-400">?api_key=&lt;key&gt;</code>. Useful for browser URL navigation, webhooks, or image loading.</li>
                </ul>
              </div>

              <div className="p-5 rounded-2xl border space-y-3" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
                <h3 className="text-sm font-black flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                  <svg className="w-4 h-4 text-cyan-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                  </svg>
                  <span>2. HTTP Response Status Codes</span>
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="p-3 rounded-lg border" style={{ background: 'var(--bg-surface-2)', borderColor: 'var(--border)' }}>
                    <div className="font-mono font-bold text-emerald-400">200 OK</div>
                    <div className="text-zinc-400 text-[11px] mt-0.5">The request was successful and data is returned in the payload.</div>
                  </div>
                  <div className="p-3 rounded-lg border" style={{ background: 'var(--bg-surface-2)', borderColor: 'var(--border)' }}>
                    <div className="font-mono font-bold text-amber-400">401 Unauthorized</div>
                    <div className="text-zinc-400 text-[11px] mt-0.5">Missing or invalid API key credentials.</div>
                  </div>
                  <div className="p-3 rounded-lg border" style={{ background: 'var(--bg-surface-2)', borderColor: 'var(--border)' }}>
                    <div className="font-mono font-bold text-rose-400">404 Not Found</div>
                    <div className="text-zinc-400 text-[11px] mt-0.5">The requested resource (card number, UUID, or set code) was not found.</div>
                  </div>
                  <div className="p-3 rounded-lg border" style={{ background: 'var(--bg-surface-2)', borderColor: 'var(--border)' }}>
                    <div className="font-mono font-bold text-red-500">500 Internal Error</div>
                    <div className="text-zinc-400 text-[11px] mt-0.5">Database connectivity or unexpected server-side execution error.</div>
                  </div>
                </div>
              </div>

              <div className="p-5 rounded-2xl border space-y-3" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
                <h3 className="text-sm font-black flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                  <svg className="w-4 h-4 text-purple-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="16 18 22 12 16 6" />
                    <polyline points="8 6 2 12 8 18" />
                  </svg>
                  <span>3. Pagination & Cursor Handling</span>
                </h3>
                <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                  All collection queries are paginated to maintain high response times. Standard pagination envelope:
                </p>
                <pre className="p-3 rounded-lg font-mono text-[11px] text-cyan-300" style={{ background: '#090a0f' }}>
{`"pagination": {
  "page": 1,
  "limit": 20,
  "total": 1575,
  "total_pages": 79,
  "has_next": true,
  "has_prev": false
}`}
                </pre>
                <p className="text-xs text-zinc-400">
                  Clients should consume <code className="text-emerald-400">has_next</code> and advance <code className="text-emerald-400">page</code> parameter for cursor iteration.
                </p>
              </div>
            </div>
          )}

          {/* TAB 5: API Key Management (owner-only) */}
          {activeTab === 'keys' && isOwner && (
            <div className="space-y-4">
              <ApiKeysPanel />
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
