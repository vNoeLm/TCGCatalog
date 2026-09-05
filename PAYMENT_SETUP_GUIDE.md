# Payment Gateway Setup Guide (Stripe & Barion)

This guide walks you through setting up real payment processing for **Stripe** (Cards, Apple Pay, Google Pay) and **Barion Smart Gateway** (Bank Cards, Barion Wallet) in TCG Vault.

---

## What is Already Set Up for You in Code

You do **not** need to code any payment logic. All of the following is completely implemented:
1. **Stripe Checkout API** (`/api/checkout/stripe`): Automatically generates official Stripe hosted checkout sessions with HUF currency line items. Apple Pay and Google Pay are natively enabled.
2. **Stripe Webhook Handler** (`/api/checkout/webhook-stripe`): Automatically verifies webhook signatures and instantly updates the order in your database to `Paid` / `Processing`.
3. **Barion Smart Gateway API** (`/api/checkout/barion`): Creates official Barion checkout transactions with line items and 0% gateway fee config.
4. **Barion Server Callback** (`/api/checkout/callback-barion`): Server-to-server endpoint that calls Barion's `GetPaymentState` API and marks orders as `Paid`.
5. **Seamless Fallback Simulator**: Whenever no real API keys are set in `.env`, the checkout automatically switches to the interactive simulation modal for risk-free testing. As soon as you add real keys, it switches to the real gateways.

---

## Part 1: Setting Up Stripe (Apple Pay, Google Pay & Cards)

### Step 1: Get your API Keys
1. Go to [https://dashboard.stripe.com/register](https://dashboard.stripe.com/register) and create or log in to your account.
2. In the top bar, keep **Test mode** toggled **ON** while setting up.
3. Go to **Developers** → **API keys** ([https://dashboard.stripe.com/test/apikeys](https://dashboard.stripe.com/test/apikeys)).
4. Copy the following two keys:
   - **Publishable key**: starts with `pk_test_...`
   - **Secret key**: click "Reveal test key" (starts with `sk_test_...`)

### Step 2: Set up the Stripe Webhook (Automatic Order Settlement)
1. In the Stripe Dashboard, go to **Developers** → **Webhooks** ([https://dashboard.stripe.com/test/webhooks](https://dashboard.stripe.com/test/webhooks)).
2. Click **Add endpoint**.
3. In **Endpoint URL**, enter:
   - For production (e.g. on Vercel): `https://your-domain.vercel.app/api/checkout/webhook-stripe`
   - For local testing: you can use the Stripe CLI: `stripe listen --forward-to localhost:4321/api/checkout/webhook-stripe`
4. Under **Select events to listen to**, select:
   - `checkout.session.completed`
   - `payment_intent.succeeded`
5. Click **Add endpoint**.
6. Under **Signing secret**, click **Reveal** and copy the secret (starts with `whsec_...`).

### Step 3: Apple Pay & Google Pay Domain Verification
1. In Stripe Dashboard, go to **Settings** → **Payment methods** ([https://dashboard.stripe.com/settings/payment_methods](https://dashboard.stripe.com/settings/payment_methods)).
2. Under **Apple Pay**, add your production website domain (e.g., `your-domain.vercel.app`). Stripe will guide you to host the verification file if needed (hosted Stripe Checkout pages handle Apple Pay automatically without extra files).

---

## Part 2: Setting Up Barion Smart Gateway

Barion has a free Sandbox environment for testing before you submit your business documents for live production.

### Step 1: Create a Barion Sandbox Account
1. Go to the Barion Test Environment: [https://secure.test.barion.com](https://secure.test.barion.com) (or [https://secure.barion.com](https://secure.barion.com) for production).
2. Register as a Merchant / Business wallet.

### Step 2: Create a Shop and Get your POSKey
1. In your Barion wallet, go to **Manage Shops** (**Boltok kezelése**).
2. Click **Create new shop** (**Új bolt létrehozása**).
3. Fill in your shop details:
   - **Shop Name**: TCG Vault
   - **Website URL**: your domain (or `http://localhost:4321` for test)
4. Once created, click on the shop details and copy the **POSKey** (a 36-character GUID, e.g. `11111111-2222-3333-4444-555555555555`).
5. Note down your **Barion Payee Email** (the email address of your Barion account).

---

## Part 3: Adding the Keys to Your Project

### For Local Development:
Open your `.env` file in the root of the project:
```env
# Stripe
STRIPE_SECRET_KEY=sk_test_51...
STRIPE_PUBLISHABLE_KEY=pk_test_51...
STRIPE_WEBHOOK_SECRET=whsec_...

# Barion
BARION_POS_KEY=your-pos-key-guid-here
BARION_PAYEE_EMAIL=your-barion-account-email@example.com
BARION_ENVIRONMENT=test
```

### For Production (Vercel):
1. Go to your project on [https://vercel.com](https://vercel.com).
2. Navigate to **Settings** → **Environment Variables**.
3. Add each variable (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `BARION_POS_KEY`, `BARION_PAYEE_EMAIL`, etc.).
4. For live payments, change `BARION_ENVIRONMENT` to `prod` and use your live Stripe keys (`sk_live_...`, `pk_live_...`).
5. Trigger a redeploy.

---

## Part 4: Test Credentials

### Stripe Test Card Numbers:
- Card Number: `4242 4242 4242 4242`
- Expiry Date: Any future date (e.g. `12/28`)
- CVC: Any 3 digits (e.g. `123`)
- Postal Code: Any valid postal code

### Barion Test Cards:
In the Barion sandbox environment, Barion provides pre-funded virtual test cards directly inside the sandbox payment interface.
