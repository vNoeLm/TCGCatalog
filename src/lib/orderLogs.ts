import { supabaseAdmin } from './supabaseServer';

export interface OrderLogEntry {
  id?: string;
  order_id?: string | null;
  order_number: string;
  event_type: string;
  severity: 'info' | 'warn' | 'error';
  message: string;
  metadata?: Record<string, any>;
  created_at?: string;
}

/**
 * Persists an event or error to the centralized order_logs table.
 * Gracefully degrades to console logging if the table is not yet migrated.
 */
export async function logOrderEvent(params: {
  orderNumber: string;
  orderId?: string | null;
  eventType: string;
  message: string;
  severity?: 'info' | 'warn' | 'error';
  metadata?: Record<string, any>;
}): Promise<void> {
  const {
    orderNumber,
    orderId = null,
    eventType,
    message,
    severity = 'info',
    metadata = {},
  } = params;

  const logPayload: OrderLogEntry = {
    order_id: orderId,
    order_number: orderNumber,
    event_type: eventType,
    severity,
    message,
    metadata,
    created_at: new Date().toISOString(),
  };

  // Immediate console notification (formatted cleanly without emojis per rules)
  const prefix = `[OrderLog - ${severity.toUpperCase()}] [Order #${orderNumber}] [${eventType}]:`;
  if (severity === 'error') {
    console.error(prefix, message, metadata);
  } else if (severity === 'warn') {
    console.warn(prefix, message, metadata);
  } else {
    console.log(prefix, message);
  }

  // Database persistence
  try {
    const { error } = await supabaseAdmin
      .from('order_logs')
      .insert({
        order_id: orderId,
        order_number: orderNumber,
        event_type: eventType,
        severity,
        message,
        metadata,
      });

    if (error) {
      // Table may not exist yet in remote schema; logged to console above
    }
  } catch (err) {
    // Suppress network/table errors to prevent breaking the critical user checkout path
  }
}

/**
 * Retrieves audit logs for a given order number.
 */
export async function fetchOrderLogs(orderNumber: string): Promise<OrderLogEntry[]> {
  try {
    const { data, error } = await supabaseAdmin
      .from('order_logs')
      .select('*')
      .eq('order_number', orderNumber)
      .order('created_at', { ascending: false });

    if (!error && Array.isArray(data)) {
      return data as OrderLogEntry[];
    }
  } catch (e) {}

  return [];
}
