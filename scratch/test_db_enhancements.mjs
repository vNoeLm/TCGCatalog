import fs from 'fs';
import path from 'path';
import { acquireIdempotencyLock, completeIdempotency, failIdempotency } from '../src/lib/idempotency.ts';
import { logOrderEvent } from '../src/lib/orderLogs.ts';
import { persistOrderItemsSnapshot } from '../src/lib/orderItems.ts';

console.log('=== 1. Testing Idempotency Module ===');
const testKey = `evt_test_${Date.now()}`;
const firstAcquire = await acquireIdempotencyLock(testKey, 'unit_test', 60);
console.log('First acquire (expected: isDuplicate=false):', firstAcquire.isDuplicate);
if (firstAcquire.isDuplicate) throw new Error('First acquire should not be duplicate');

// In progress check
const secondAcquire = await acquireIdempotencyLock(testKey, 'unit_test', 60);
console.log('Second acquire while in progress (expected: isDuplicate=true, inProgress=true):', secondAcquire);
if (!secondAcquire.isDuplicate || !secondAcquire.inProgress) throw new Error('Second acquire should be in-progress duplicate');

// Complete idempotency
await completeIdempotency(testKey, { processed: true, testValue: 123 });

// Third check
const thirdAcquire = await acquireIdempotencyLock(testKey, 'unit_test', 60);
console.log('Third acquire after completion (expected: isDuplicate=true, response cached):', thirdAcquire);
if (!thirdAcquire.isDuplicate || thirdAcquire.response?.testValue !== 123) throw new Error('Completed idempotency should return cached response');

console.log('=== 2. Testing Order Logs Module ===');
await logOrderEvent({
  orderNumber: 'TEST-ORD-001',
  orderId: 'ord_test_001',
  eventType: 'test_event',
  message: 'Integration test event message',
  severity: 'info',
  metadata: { test: true }
});
console.log('logOrderEvent executed successfully');

console.log('=== 3. Testing Order Items Snapshot Module ===');
const sampleItems = [
  {
    inventory_id: '11111111-1111-1111-1111-111111111111',
    card_id: '22222222-2222-2222-2222-222222222222',
    name: 'Spireblade Infiltrator',
    set_name: 'Origins',
    card_number: 'OGN-001/219',
    condition: 'Near Mint',
    is_foil: false,
    price_huf: 1500,
    quantity: 2
  }
];
const snapshots = await persistOrderItemsSnapshot('ord_test_001', 'TEST-ORD-001', sampleItems);
console.log('Snapshots created count:', snapshots.length);
console.log('Snapshot title:', snapshots[0].title);
console.log('Snapshot unit_price_huf:', snapshots[0].unit_price_huf);
console.log('Snapshot quantity:', snapshots[0].quantity);
if (snapshots[0].title !== 'Spireblade Infiltrator' || snapshots[0].unit_price_huf !== 1500) {
  throw new Error('Snapshot fields did not match input');
}

console.log('=== 4. Validating SQL Migration File Syntax ===');
const sqlPath = path.resolve('supabase/migrations/20260911000000_database_optimizations_and_safety.sql');
if (!fs.existsSync(sqlPath)) throw new Error('Migration file does not exist');
const sqlContent = fs.readFileSync(sqlPath, 'utf-8');

const requiredTokens = [
  'CREATE EXTENSION IF NOT EXISTS pg_trgm',
  'idx_cards_name_trgm',
  'gin_trgm_ops',
  'is_archived',
  'chk_inventory_quantity_non_negative',
  'chk_inventory_status_valid',
  'idempotency_keys',
  'order_items',
  'order_logs',
  'inventory_reservations',
  'deduct_order_inventory',
  'SELECT quantity INTO v_current_qty',
  'FOR UPDATE',
  'reserve_order_inventory',
  'release_expired_reservations',
  'Users can view own orders or admin view all',
  'Allow public read active cards'
];

for (const token of requiredTokens) {
  if (!sqlContent.includes(token)) {
    throw new Error(`Missing token in SQL migration: ${token}`);
  }
}
console.log(`All ${requiredTokens.length} SQL migration verification tokens present!`);

console.log('ALL DB OPTIMIZATION TESTS PASSED SUCCESSFULLY!');
