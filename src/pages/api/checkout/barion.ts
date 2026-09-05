import type { APIRoute } from 'astro';

export const prerender = false;

interface BarionCheckoutItem {
  name: string;
  priceHuf: number;
  quantity: number;
}

export const POST: APIRoute = async ({ request, url }) => {
  try {
    const body = await request.json();
    const {
      orderNumber,
      customerEmail,
      items,
      totalHuf,
      redirectUrl,
      callbackUrl,
    }: {
      orderNumber: string;
      customerEmail: string;
      items: BarionCheckoutItem[];
      totalHuf: number;
      redirectUrl?: string;
      callbackUrl?: string;
    } = body;

    if (!orderNumber || !customerEmail) {
      return new Response(JSON.stringify({ success: false, error: 'Missing order number or customer email.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const barionPosKey = process.env.BARION_POS_KEY;
    const barionPayeeEmail = process.env.BARION_PAYEE_EMAIL || 'merchant@tcgvault.hu';
    const isProd = process.env.BARION_ENVIRONMENT === 'prod' || process.env.NODE_ENV === 'production';
    const barionBaseUrl = isProd ? 'https://api.barion.com' : 'https://api.test.barion.com';

    const origin = url.origin;
    const defaultRedirectUrl = `${origin}/checkout/success?order_number=${encodeURIComponent(orderNumber)}&gateway=barion`;
    const defaultCallbackUrl = `${origin}/api/checkout/callback-barion`;

    // ── LIVE / TEST BARION API MODE ──
    if (barionPosKey) {
      const validItems = Array.isArray(items) && items.length > 0 ? items : [{ name: `TCG Order #${orderNumber}`, priceHuf: totalHuf, quantity: 1 }];

      const barionPayload = {
        POSKey: barionPosKey,
        PaymentType: 'Immediate',
        GuestCheckOut: true,
        FundingSources: ['All'],
        PaymentRequestId: orderNumber,
        PayerHint: customerEmail,
        RedirectUrl: redirectUrl || defaultRedirectUrl,
        CallbackUrl: callbackUrl || defaultCallbackUrl,
        Transactions: [
          {
            POSTransactionId: `${orderNumber}-01`,
            Payee: barionPayeeEmail,
            Total: Math.max(1, Math.round(totalHuf)),
            Comment: `Order #${orderNumber}`,
            Items: validItems.map((it, idx) => ({
              Name: it.name || `Card item #${idx + 1}`,
              Description: it.name || `Card item #${idx + 1}`,
              Quantity: Math.max(1, it.quantity || 1),
              Unit: 'piece',
              UnitPrice: Math.max(1, Math.round(it.priceHuf)),
              ItemTotal: Math.max(1, Math.round(it.priceHuf * (it.quantity || 1))),
            })),
          },
        ],
        Locale: 'hu-HU',
        Currency: 'HUF',
      };

      const barionResponse = await fetch(`${barionBaseUrl}/v2/Payment/Start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(barionPayload),
      });

      const barionData = await barionResponse.json();

      if (!barionResponse.ok || !barionData.GatewayUrl) {
        console.error('Barion Start Payment Error:', barionData);
        const errMsg = Array.isArray(barionData.Errors) && barionData.Errors.length > 0
          ? barionData.Errors.map((e: any) => e.Description || e.Title).join('; ')
          : 'Barion gateway error.';

        return new Response(JSON.stringify({
          success: false,
          error: errMsg,
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({
        success: true,
        mode: 'hosted',
        url: barionData.GatewayUrl,
        paymentId: barionData.PaymentId,
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // ── SIMULATOR / DEMO MODE (When merchant hasn't provided BARION_POS_KEY yet) ──
    const mockPaymentId = `BARION-${Date.now().toString(36).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;
    return new Response(JSON.stringify({
      success: true,
      mode: 'simulator',
      orderNumber,
      paymentId: mockPaymentId,
      totalHuf,
      message: 'Barion simulated sandbox ready',
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('Barion endpoint error:', err);
    return new Response(JSON.stringify({ success: false, error: err?.message || 'Server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
