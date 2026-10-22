import { describe, it, expect } from 'vitest';
import { parseCsvText, parseMoney, rowsFromCsv } from '../src/lib/storeCsv';
import { planImport, type ExistingProduct } from '../src/lib/storeImport';

describe('parseMoney', () => {
  it('handles Hungarian and English number formats', () => {
    expect(parseMoney('4 990 Ft')).toBe(4990);
    expect(parseMoney('4.990')).toBe(4990);
    expect(parseMoney('4990,00')).toBe(4990);
    expect(parseMoney('4,990.00')).toBe(4990);
    expect(parseMoney('12.990,50')).toBe(12991);
    expect(parseMoney('abc')).toBeNull();
  });
});

describe('parseCsvText', () => {
  it('detects the semicolon delimiter and strips the BOM', () => {
    const rows = parseCsvText('\uFEFFsku;name\nA1;Foo\n');
    expect(rows).toEqual([['sku', 'name'], ['A1', 'Foo']]);
  });

  it('handles quoted fields with delimiters, quotes and newlines', () => {
    const rows = parseCsvText('sku,name\n"A1","Foo, ""Bar""\nbaz"\n');
    expect(rows[1]).toEqual(['A1', 'Foo, "Bar"\nbaz']);
  });
});

describe('rowsFromCsv', () => {
  it('maps English and Hungarian headers and normalises values', () => {
    const csv = 'Cikkszám;Terméknév;Márka;Kategória;Ár;Készlet;Játék\nUG-1;Katana Black;Ultimate Guard;sleeve;4 990 Ft;12;universal';
    const { rows, issues } = rowsFromCsv(csv);
    expect(issues).toEqual([]);
    expect(rows[0]).toMatchObject({
      sku: 'UG-1', name: 'Katana Black', brand: 'Ultimate Guard',
      category: 'sleeves', price_huf: 4990, stock_quantity: 12, game: null,
    });
  });

  it('reports unknown categories and bad numbers per line', () => {
    const { rows, issues } = rowsFromCsv('sku,name,category,price\nA,Foo,wat,100\nB,Bar,sleeves,xx');
    expect(rows).toHaveLength(0);
    expect(issues.map((i) => i.line)).toEqual([2, 3]);
  });

  it('only sets columns that are present and non-empty', () => {
    const { rows } = rowsFromCsv('sku,price,stock\nA,100,\n');
    expect(rows[0]).toEqual({ line: 2, sku: 'A', price_huf: 100 });
  });
});

describe('planImport', () => {
  const existing = new Map<string, ExistingProduct>([['UG-1', { id: 'p1', sku: 'UG-1', attributes: { size: 'Standard' } }]]);
  const defaults = { brand: 'Ultimate Guard', category: 'sleeves' as const };

  it('creates unknown SKUs as drafts using defaults', () => {
    const [item] = planImport([{ line: 2, sku: 'UG-2', name: 'Katana Red', price_huf: 5000 }], existing, defaults);
    expect(item.action).toBe('create');
    expect(item.product).toMatchObject({ brand: 'Ultimate Guard', category: 'sleeves', status: 'draft', stock_quantity: 0, sku: 'UG-2' });
    expect(item.product?.slug).toBe('katana-red-ug-2');
  });

  it('updates known SKUs with only the provided columns', () => {
    const [item] = planImport([{ line: 2, sku: 'UG-1', price_huf: 5200, stock_quantity: 3 }], existing, defaults);
    expect(item.action).toBe('update');
    expect(item.product).toEqual({ price_huf: 5200, stock_quantity: 3 });
  });

  it('does not apply defaults to updates', () => {
    const [item] = planImport([{ line: 2, sku: 'UG-1', price_huf: 1 }], existing, defaults);
    expect(item.product).not.toHaveProperty('brand');
  });

  it('merges colour/size into existing attributes', () => {
    const [item] = planImport([{ line: 2, sku: 'UG-1', color: 'Black' }], existing, defaults);
    expect(item.product?.attributes).toEqual({ size: 'Standard', color: 'Black' });
  });

  it('flags missing SKU, duplicates and incomplete new products', () => {
    const plan = planImport(
      [
        { line: 2, name: 'No sku', price_huf: 1 },
        { line: 3, sku: 'X', name: 'A', price_huf: 1 },
        { line: 4, sku: 'X', name: 'B', price_huf: 1 },
        { line: 5, sku: 'Y', name: 'No price' },
      ],
      existing,
      defaults
    );
    expect(plan.map((p) => p.action)).toEqual(['error', 'create', 'error', 'error']);
  });

  it('keeps cost and supplier in the private part', () => {
    const [item] = planImport([{ line: 2, sku: 'UG-1', cost_price_huf: 3000, supplier: 'Acme' }], existing, defaults);
    expect(item.priv).toEqual({ supplier: 'Acme', cost_price_huf: 3000 });
    expect(item.product).toEqual({});
  });

  it('rejects non-http image URLs', () => {
    const [item] = planImport([{ line: 2, sku: 'Z', name: 'A', price_huf: 1, images: ['javascript:alert(1)'] }], existing, defaults);
    expect(item.action).toBe('error');
  });
});
