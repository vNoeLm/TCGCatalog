import type { APIRoute } from 'astro';

export const prerender = false;

interface StripeCheckoutItem {
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
      cancelUrl,
      successUrl,
    }: {
      orderNumber: string;
      customerEmail: string;
      items: StripeCheckoutItem[];
      totalHuf: number;
      cancelUrl?: string;
      successUrl?: string;
    } = body;

    if (!orderNumber || !customerEmail) {
      return new Response(JSON.stringify({ success: false, error: 'Missing order number or customer email.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const stripeSecretKey = process.env.STRIPE_SECRET_KEY || (import.meta as any).env?.STRIPE_SECRET_KEY;
    const origin = url.origin;
    const defaultSuccessUrl = `${origin}/checkout/success?order_number=${encodeURIComponent(orderNumber)}&gateway=stripe&session_id={CHECKOUT_SESSION_ID}`;
    const defaultCancelUrl = `${origin}/store?order_cancelled=${encodeURIComponent(orderNumber)}`;

    // ── LIVE / TEST STRIPE API MODE ──
    if (stripeSecretKey) {
      const params = new URLSearchParams();
      // Omitting payment_method_types allows Stripe Checkout to automatically present
      // Apple Pay, Google Pay, Card, and all other enabled payment methods.
      params.append('mode', 'payment');
      params.append('customer_email', customerEmail);
      params.append('client_reference_id', orderNumber);
      params.append('metadata[order_number]', orderNumber);
      params.append('success_url', successUrl || defaultSuccessUrl);
      params.append('cancel_url', cancelUrl || defaultCancelUrl);

      // Line items
      const validItems = Array.isArray(items) && items.length > 0 ? items : [{ name: `TCG Order #${orderNumber}`, priceHuf: totalHuf, quantity: 1 }];
      validItems.forEach((it, idx) => {
        params.append(`line_items[${idx}][price_data][currency]`, 'huf');
        // In Stripe, HUF is a two-decimal currency: unit_amount is in fillér (1 HUF = 100 subunits)
        params.append(`line_items[${idx}][price_data][unit_amount]`, String(Math.max(100, Math.round(it.priceHuf * 100))));
        params.append(`line_items[${idx}][price_data][product_data][name]`, it.name || `Card item #${idx + 1}`);
        params.append(`line_items[${idx}][quantity]`, String(Math.max(1, it.quantity || 1)));
      });

      const stripeResponse = await fetch('https://api.stripe.com/v1/checkout/sessions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${stripeSecretKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });

      const stripeData = await stripeResponse.json();

      if (!stripeResponse.ok || !stripeData.url) {
        console.error('Stripe Checkout Error:', stripeData);
        return new Response(JSON.stringify({
          success: false,
          error: stripeData?.error?.message || 'Stripe session creation failed.',
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({
        success: true,
        mode: 'hosted',
        url: stripeData.url,
        sessionId: stripeData.id,
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // ── SIMULATOR / DEMO MODE (When merchant hasn't provided STRIPE_SECRET_KEY yet) ──
    const mockSessionId = `cs_sim_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    return new Response(JSON.stringify({
      success: true,
      mode: 'simulator',
      orderNumber,
      sessionId: mockSessionId,
      totalHuf,
      message: 'Stripe simulated sandbox ready',
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('Stripe endpoint error:', err);
    return new Response(JSON.stringify({ success: false, error: err?.message || 'Server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
