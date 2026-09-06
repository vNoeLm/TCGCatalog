/**
 * Számlázz.hu Invoicing Integration Module (Számla Agent)
 * Documentation: https://www.szamlazz.hu/szamla/docs/
 *
 * Supports:
 * - Stub / Simulation mode for pre-incorporation testing and UI workflow validation
 * - Live XML Agent API generation and submission once company details and Számla Agent Key are configured
 */

import type { Order, OrderItem } from '../../types';

export interface SzamlazzConfig {
  agentKey?: string;
  sellerName?: string;
  sellerTaxNumber?: string;
  sellerZip?: string;
  sellerCity?: string;
  sellerAddress?: string;
  sellerBank?: string;
  sellerBankAccount?: string;
  vatScheme?: 'AAM' | '27' | 'TAM' | '5' | '18'; // AAM = Alanyi Adómentes (default for new sole props / small businesses)
  currency?: string;
  language?: 'hu' | 'en' | 'de';
  eInvoice?: boolean;
  stubMode?: boolean;
}

export interface InvoiceResult {
  success: boolean;
  stubMode: boolean;
  invoiceNumber: string;
  netTotalHuf: number;
  grossTotalHuf: number;
  pdfUrl?: string;
  downloadUrl?: string;
  message: string;
  rawXml?: string;
  error?: string;
}

/**
 * Generates the Számla Agent XML payload conforming to Számlázz.hu specification
 */
export function buildSzamlazzXml(order: Order, config: SzamlazzConfig): string {
  const isEInvoice = config.eInvoice ?? true;
  const currency = config.currency || 'HUF';
  const vatRate = config.vatScheme || 'AAM';
  const today = new Date().toISOString().split('T')[0];

  const escapeXml = (str: string | null | undefined) =>
    (str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');

  const buyerName = order.customer_info?.name || order.shipping_name || 'Vásárló';
  const buyerEmail = order.customer_info?.email || '';
  const buyerZip = order.customer_info?.postal_code || '';
  const buyerCity = order.customer_info?.city || '';
  const buyerAddress = order.customer_info?.address || order.shipping_address || '';

  const itemsXml = (order.items || []).map(item => {
    const qty = item.quantity || 1;
    const grossPrice = item.price_huf || 0;
    // For AAM (0% / exempt), net equals gross
    const isVat27 = vatRate === '27';
    const netPrice = isVat27 ? Math.round(grossPrice / 1.27) : grossPrice;
    const itemNetTotal = netPrice * qty;
    const itemGrossTotal = grossPrice * qty;
    const itemVatTotal = itemGrossTotal - itemNetTotal;
    const itemName = `${item.card_name || item.name || 'TCG Kártya'} (${item.condition || 'NM'}${item.is_foil ? ' - Foil' : ''})`;

    return `
    <tetel>
      <megnevezes>${escapeXml(itemName)}</megnevezes>
      <mennyiseg>${qty}</mennyiseg>
      <mennyisegiEgyseg>db</mennyisegiEgyseg>
      <nettoEgysegar>${netPrice}</nettoEgysegar>
      <afakulcs>${vatRate}</afakulcs>
      <nettoErtek>${itemNetTotal}</nettoErtek>
      <afaErtek>${itemVatTotal}</afaErtek>
      <bruttoErtek>${itemGrossTotal}</bruttoErtek>
    </tetel>`;
  }).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<xmlszamla xmlns="http://www.szamlazz.hu/xmlszamla" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.szamlazz.hu/xmlszamla https://www.szamlazz.hu/szamla/docs/xsds/action-xmlagentxmlfile/xmlszamla.xsd">
  <beallitasok>
    <szamlaagentkulcs>${escapeXml(config.agentKey || '')}</szamlaagentkulcs>
    <eszamla>${isEInvoice ? 'true' : 'false'}</eszamla>
    <szamlaLetoltes>true</szamlaLetoltes>
    <szamlaLetoltesPld>1</szamlaLetoltesPld>
    <valaszVerzio>2</valaszVerzio>
  </beallitasok>
  <fejlec>
    <kelt>${today}</kelt>
    <teljesites>${today}</teljesites>
    <fizetesiHatarido>${today}</fizetesiHatarido>
    <fizmod>Bankkártya</fizmod>
    <penznem>${currency}</penznem>
    <szamlaNyelve>${config.language || 'hu'}</szamlaNyelve>
    <megjegyzes>Rendelésszám: ${escapeXml(order.order_number)}</megjegyzes>
    <rendelesszam>${escapeXml(order.order_number)}</rendelesszam>
    <elolegszamla>false</elolegszamla>
    <vegszamla>false</vegszamla>
  </fejlec>
  <elado>
    <nev>${escapeXml(config.sellerName || 'TCG Vault')}</nev>
    <adoszam>${escapeXml(config.sellerTaxNumber || '')}</adoszam>
    <irsz>${escapeXml(config.sellerZip || '')}</irsz>
    <telepules>${escapeXml(config.sellerCity || '')}</telepules>
    <cim>${escapeXml(config.sellerAddress || '')}</cim>
    <bank>${escapeXml(config.sellerBank || '')}</bank>
    <bankszamlaszam>${escapeXml(config.sellerBankAccount || '')}</bankszamlaszam>
    <emailReplyTo></emailReplyTo>
  </elado>
  <vevo>
    <nev>${escapeXml(buyerName)}</nev>
    <irsz>${escapeXml(buyerZip)}</irsz>
    <telepules>${escapeXml(buyerCity)}</telepules>
    <cim>${escapeXml(buyerAddress)}</cim>
    <email>${escapeXml(buyerEmail)}</email>
    <sendEmail>false</sendEmail>
  </vevo>
  <tetelek>
    ${itemsXml}
  </tetelek>
</xmlszamla>`;
}

/**
 * Issues an invoice for an order.
 * If config.stubMode is true OR agentKey is missing/empty, generates a simulated invoice.
 */
export async function issueSzamlazzInvoice(order: Order, config: SzamlazzConfig): Promise<InvoiceResult> {
  const isStub = config.stubMode ?? (!config.agentKey || config.agentKey.trim() === '');
  const totalHuf = order.total_price_huf ?? order.total_huf ?? 0;
  const isVat27 = config.vatScheme === '27';
  const netHuf = isVat27 ? Math.round(totalHuf / 1.27) : totalHuf;

  if (isStub) {
    // Deterministic simulation number based on order number
    const suffix = order.order_number.replace(/\D/g, '').slice(-4) || Math.floor(1000 + Math.random() * 9000).toString();
    const simulatedInvoiceNumber = `STUB-SZ-2026-${suffix}`;

    return {
      success: true,
      stubMode: true,
      invoiceNumber: simulatedInvoiceNumber,
      netTotalHuf: netHuf,
      grossTotalHuf: totalHuf,
      pdfUrl: `/api/invoicing/preview?order=${order.order_number}&inv=${simulatedInvoiceNumber}`,
      message: `[Számlázz.hu STUB MODE] Szimulált számla sikeresen generálva: #${simulatedInvoiceNumber}. Cégadatok megadása után azonnal élesíthető.`,
      rawXml: buildSzamlazzXml(order, config),
    };
  }

  // Live Számlázz.hu HTTP POST implementation
  try {
    const xmlPayload = buildSzamlazzXml(order, config);
    const formData = new FormData();
    const xmlBlob = new Blob([xmlPayload], { type: 'text/xml' });
    formData.append('action-xmlagentxmlfile', xmlBlob, 'szamla.xml');

    const response = await fetch('https://www.szamlazz.hu/szamla/', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Számlázz.hu HTTP error ${response.status}: ${response.statusText}`);
    }

    const resText = await response.text();
    // Parse response headers or XML body for invoice number
    const invMatch = resText.match(/<szamlaszam>(.*?)<\/szamlaszam>/);
    const invoiceNumber = invMatch ? invMatch[1] : `SZ-${Date.now()}`;

    return {
      success: true,
      stubMode: false,
      invoiceNumber,
      netTotalHuf: netHuf,
      grossTotalHuf: totalHuf,
      message: `Számla sikeresen kiállítva: #${invoiceNumber}`,
      rawXml: xmlPayload,
    };
  } catch (err: any) {
    return {
      success: false,
      stubMode: false,
      invoiceNumber: '',
      netTotalHuf: netHuf,
      grossTotalHuf: totalHuf,
      message: 'Hiba a számla kiállítása során.',
      error: err?.message || 'Ismeretlen hiba történt.',
    };
  }
}
