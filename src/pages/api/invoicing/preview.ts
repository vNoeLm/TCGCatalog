import type { APIRoute } from 'astro';

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  const orderNum = url.searchParams.get('order') || 'ORD-TEST';
  const invNum = url.searchParams.get('inv') || 'STUB-INV-2026-0001';

  const html = `<!DOCTYPE html>
<html lang="hu">
<head>
  <meta charset="UTF-8" />
  <title>Számla Másolat - ${invNum}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0f172a; color: #f8fafc; padding: 40px 20px; }
    .container { max-width: 700px; margin: 0 auto; background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 32px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
    .header { display: flex; justify-content: space-between; border-bottom: 2px solid #f59e0b; padding-bottom: 16px; margin-bottom: 24px; }
    .badge { background: #f59e0b; color: #000; font-weight: 800; font-size: 11px; padding: 4px 8px; border-radius: 4px; text-transform: uppercase; }
    .title { font-size: 22px; font-weight: 900; margin: 0; }
    .subtitle { font-size: 13px; color: #94a3b8; margin-top: 4px; }
    .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px; font-size: 13px; }
    .meta-box { background: #0f172a; padding: 12px; border-radius: 8px; border: 1px solid #334155; }
    .meta-box strong { color: #cbd5e1; display: block; margin-bottom: 4px; font-size: 11px; text-transform: uppercase; }
    .notice { background: rgba(245, 158, 11, 0.12); border: 1px solid #f59e0b; color: #fbbf24; padding: 12px 16px; border-radius: 8px; font-size: 12px; margin-bottom: 24px; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div>
        <h1 class="title">SZÁMLA (SZIMULÁCIÓ)</h1>
        <div class="subtitle">Számlaszám: <strong>${invNum}</strong> · Számlázz.hu Agent Pre-release</div>
      </div>
      <div>
        <span class="badge">Stub Mód</span>
      </div>
    </div>

    <div class="notice">
      ℹ️ <strong>Cégalapítás előtt álló vállalkozási előkészítés</strong><br/>
      Ez egy szimulált Számlázz.hu számla előnézet a #${orderNum} rendeléshez. A cégbejegyzés és az adószám megszerzése után a Számla Agent kulcs beírásával azonnal hiteles, NAV-álló e-számla generálódik.
    </div>

    <div class="meta-grid">
      <div class="meta-box">
        <strong>Kibocsátó (Eladó):</strong>
        TCG Vault Kft. (Bejegyzés alatt)<br/>
        Adószám: <i>Hamarosan</i><br/>
        Bankszámla: <i>Hamarosan</i>
      </div>
      <div class="meta-box">
        <strong>Rendelés adatok:</strong>
        Hivatkozás: #${orderNum}<br/>
        Dátum: ${new Date().toLocaleDateString('hu-HU')}<br/>
        Fizetési mód: Bankkártya (Stripe)
      </div>
    </div>

    <div style="text-align: center; margin-top: 32px; font-size: 11px; color: #64748b;">
      TCG Vault E-Commerce Systems · Számlázz.hu API v2 ready
    </div>
  </div>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
};
