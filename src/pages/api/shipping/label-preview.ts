import type { APIRoute } from 'astro';

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  const orderNum = url.searchParams.get('order') || 'ORD-TEST';
  const tracking = url.searchParams.get('tracking') || 'FF-GLS-98234112';

  const html = `<!DOCTYPE html>
<html lang="hu">
<head>
  <meta charset="UTF-8" />
  <title>Csomagcímke Minta - ${tracking}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0f172a; color: #f8fafc; padding: 40px 20px; }
    .label { max-width: 500px; margin: 0 auto; background: #fff; color: #000; border: 2px dashed #000; border-radius: 8px; padding: 24px; }
    .barcode { background: #000; color: #fff; height: 50px; display: flex; align-items: center; justify-content: center; font-family: monospace; font-size: 18px; letter-spacing: 4px; margin: 16px 0; font-weight: 900; }
    .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #000; padding-bottom: 8px; margin-bottom: 12px; }
    .title { font-size: 18px; font-weight: 900; }
    .courier { font-size: 14px; font-weight: 800; background: #000; color: #fff; padding: 2px 8px; border-radius: 4px; }
    .row { font-size: 13px; margin-bottom: 6px; }
    .meta-box { border: 1px solid #ccc; padding: 8px; margin-top: 12px; font-size: 12px; }
  </style>
</head>
<body>
  <div style="max-width: 500px; margin: 0 auto 16px; background: rgba(59, 130, 246, 0.15); border: 1px solid #3b82f6; color: #93c5fd; padding: 12px 16px; border-radius: 8px; font-size: 12px;">
    ℹ️ <strong>FürgeFutár Szimulált Csomagkísérő (Stub Mode)</strong><br/>
    Rendelés: #${orderNum} · Csomagazonosító: ${tracking}. Céges adatok rögzítése után éles nyomtatásra kész PDF fuvarlevél jön létre.
  </div>

  <div class="label">
    <div class="header">
      <div class="title">FÜRGEFUTÁR CSOMAGKÍSÉRŐ</div>
      <div class="courier">GLS HUNGARY</div>
    </div>
    <div class="row"><strong>Csomagszám:</strong> ${tracking}</div>
    <div class="row"><strong>Ref:</strong> #${orderNum}</div>
    <div class="barcode">||| | |||| ||| ||||| |||</div>
    <div class="meta-box">
      <strong>Feladó:</strong> TCG Vault (Központ)<br/>
      <strong>Címzett:</strong> Megrendelő<br/>
      <strong>Tartalom:</strong> Gyűjtői kártyák
    </div>
  </div>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
};
