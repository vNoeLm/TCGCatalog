/**
 * FürgeFutár Logistics & Shipping Integration Module
 * Documentation: https://api.furgefutar.hu/ / https://furgefutar.hu
 *
 * Supports:
 * - Stub / Simulation mode for parcel booking and label generation before company incorporation
 * - Live REST API integration once API key, sender address, and courier preferences are provided
 */

import type { Order } from '../../types';

export type CourierService = 'gls' | 'dpd' | 'mpl' | 'foxpost' | 'express_one';

export interface FurgefutarConfig {
  apiKey?: string;
  defaultCourier?: CourierService;
  defaultWeightKg?: number; // e.g. 0.25 kg for card singles / decks
  senderName?: string;
  senderZip?: string;
  senderCity?: string;
  senderAddress?: string;
  senderPhone?: string;
  senderEmail?: string;
  stubMode?: boolean;
}

export interface ShipmentResult {
  success: boolean;
  stubMode: boolean;
  trackingNumber: string;
  courier: CourierService;
  courierName: string;
  labelUrl: string;
  estimatedDeliveryDays: number;
  message: string;
  error?: string;
}

export const COURIER_NAMES: Record<CourierService, string> = {
  gls: 'GLS Hungary',
  dpd: 'DPD Classic',
  mpl: 'Magyar Posta (MPL)',
  foxpost: 'Foxpost Csomagautomata',
  express_one: 'Express One',
};

/**
 * Creates a shipment / parcel booking for an order.
 * If stubMode is active or apiKey is missing, generates a simulated tracking code and label.
 */
export async function createFurgefutarShipment(
  order: Order,
  config: FurgefutarConfig
): Promise<ShipmentResult> {
  const courier = config.defaultCourier || 'gls';
  const courierName = COURIER_NAMES[courier] || 'GLS Hungary';
  const isStub = config.stubMode ?? (!config.apiKey || config.apiKey.trim() === '');

  const recipientName = order.shipping_name || order.customer_info?.name || 'Vásárló';
  const recipientZip = order.customer_info?.postal_code || '';
  const recipientCity = order.customer_info?.city || '';
  const recipientAddress = order.shipping_address || order.customer_info?.address || '';
  const recipientPhone = order.customer_info?.phone || '';
  const recipientEmail = order.customer_info?.email || '';

  if (isStub) {
    // Generate valid simulated tracking number
    const prefix = courier.toUpperCase().slice(0, 3);
    const randNum = Math.floor(10000000 + Math.random() * 90000000);
    const simulatedTracking = `FF-${prefix}-${randNum}`;

    return {
      success: true,
      stubMode: true,
      trackingNumber: simulatedTracking,
      courier,
      courierName,
      labelUrl: `/api/shipping/label-preview?order=${order.order_number}&tracking=${simulatedTracking}`,
      estimatedDeliveryDays: courier === 'gls' || courier === 'dpd' ? 1 : 2,
      message: `[FürgeFutár STUB MODE] Szállítási címke és csomagszám sikeresen rögzítve: #${simulatedTracking} (${courierName}). A csomag feladható a vállalkozás indítása után.`,
    };
  }

  // Live FürgeFutár API REST call
  try {
    const payload = {
      courier,
      sender: {
        name: config.senderName || 'TCG Vault',
        zip: config.senderZip,
        city: config.senderCity,
        address: config.senderAddress,
        phone: config.senderPhone,
        email: config.senderEmail,
      },
      recipient: {
        name: recipientName,
        zip: recipientZip,
        city: recipientCity,
        address: recipientAddress,
        phone: recipientPhone,
        email: recipientEmail,
      },
      parcel: {
        weight: config.defaultWeightKg || 0.3,
        reference: order.order_number,
        contents: 'Gyűjtői kártyajáték kártyák',
      },
    };

    const response = await fetch('https://api.furgefutar.hu/v1/shipments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': config.apiKey || '',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errJson = await response.json().catch(() => ({}));
      throw new Error(errJson.message || `FürgeFutár API HTTP ${response.status}`);
    }

    const data = await response.json();
    const trackingNumber = data.tracking_number || data.id || `FF-${Date.now()}`;
    const labelUrl = data.label_url || '';

    return {
      success: true,
      stubMode: false,
      trackingNumber,
      courier,
      courierName,
      labelUrl,
      estimatedDeliveryDays: data.delivery_days || 1,
      message: `Csomag sikeresen lefoglalva: #${trackingNumber} (${courierName})`,
    };
  } catch (err: any) {
    return {
      success: false,
      stubMode: false,
      trackingNumber: '',
      courier,
      courierName,
      labelUrl: '',
      estimatedDeliveryDays: 0,
      message: 'Hiba a csomagküldés indítása során.',
      error: err?.message || 'Ismeretlen hiba történt.',
    };
  }
}
