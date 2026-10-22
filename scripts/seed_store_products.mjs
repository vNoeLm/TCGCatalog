/**
 * Seed script: Populates realistic mock products for testing the Store and Variant system.
 * Run with: node --env-file=.env scripts/seed_store_products.mjs
 */

const SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL || 'https://xtyfzkqubmzrsvduvzcl.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_KEY) {
  console.error('SUPABASE_SERVICE_ROLE_KEY is required in .env');
  process.exit(1);
}

const headers = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
  Prefer: 'return=representation',
};

const MOCK_PRODUCTS = [
  // 1. Riftbound Booster Displays (Variant group: riftbound-booster-display, kind: set)
  {
    name: 'Riftbound: Origins Booster Display (36 Packs)',
    slug: 'riftbound-origins-booster-display',
    brand: 'Riot Games',
    game: 'riftbound',
    category: 'sealed',
    sku: 'RB-DISP-ORI',
    ean: '5901234567010',
    price_huf: 49990,
    original_price_huf: 54990,
    stock_quantity: 12,
    status: 'active',
    is_featured: true,
    variant_group: 'riftbound-booster-display',
    variant_label: 'Origins',
    variant_kind: 'set',
    description: 'Official Riftbound: Origins Booster Display containing 36 booster packs. 14 cards per pack including rare and mythic cards.',
    images: ['https://pub-fc12cf26538b49798ca89e43c2bf3c4a.r2.dev/riftbound/rad-122.webp'],
    attributes: { pack_count: 36, language: 'EN', edition: 'Origins' },
    private: { supplier: 'Blackfire EU', cost_price_huf: 34500 }
  },
  {
    name: 'Riftbound: Spiritforged Booster Display (36 Packs)',
    slug: 'riftbound-spiritforged-booster-display',
    brand: 'Riot Games',
    game: 'riftbound',
    category: 'sealed',
    sku: 'RB-DISP-SPF',
    ean: '5901234567027',
    price_huf: 51990,
    original_price_huf: null,
    stock_quantity: 8,
    status: 'active',
    is_featured: true,
    variant_group: 'riftbound-booster-display',
    variant_label: 'Spiritforged',
    variant_kind: 'set',
    description: 'Official Riftbound: Spiritforged Booster Display featuring powerful Spirit elementals and champion arts.',
    images: ['https://pub-fc12cf26538b49798ca89e43c2bf3c4a.r2.dev/riftbound/rad-038-p2.webp'],
    attributes: { pack_count: 36, language: 'EN', edition: 'Spiritforged' },
    private: { supplier: 'Blackfire EU', cost_price_huf: 36000 }
  },
  {
    name: 'Riftbound: Radiance Booster Display (36 Packs)',
    slug: 'riftbound-radiance-booster-display',
    brand: 'Riot Games',
    game: 'riftbound',
    category: 'sealed',
    sku: 'RB-DISP-RAD',
    ean: '5901234567034',
    price_huf: 54990,
    original_price_huf: null,
    stock_quantity: 16,
    status: 'active',
    is_featured: true,
    variant_group: 'riftbound-booster-display',
    variant_label: 'Radiance',
    variant_kind: 'set',
    description: 'Official Riftbound: Radiance Booster Display featuring the latest championship release and radiant foils.',
    images: ['https://pub-fc12cf26538b49798ca89e43c2bf3c4a.r2.dev/riftbound/rad-122.webp'],
    attributes: { pack_count: 36, language: 'EN', edition: 'Radiance' },
    private: { supplier: 'Blackfire EU', cost_price_huf: 38000 }
  },

  // 2. Ultimate Guard Katana Sleeves Standard Size (Variant group: ug-katana-std-100, kind: color)
  {
    name: 'Ultimate Guard Katana Sleeves Standard (100) - Jet Black',
    slug: 'ug-katana-sleeves-standard-black',
    brand: 'Ultimate Guard',
    game: null,
    category: 'sleeves',
    sku: 'UGD011101',
    ean: '4056133011101',
    price_huf: 4290,
    original_price_huf: 4590,
    stock_quantity: 24,
    status: 'active',
    is_featured: false,
    variant_group: 'ug-katana-std-100',
    variant_label: 'Jet Black',
    variant_kind: 'color',
    description: 'Precision-crafted Japanese sleeves. Outstanding shuffle feel, tournament-grade opacity, and ultimate durability for standard size cards.',
    images: ['https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=600&q=80'],
    attributes: { size: 'standard', color: 'Jet Black', count: 100 },
    private: { supplier: 'Heo Distribution', cost_price_huf: 2750 }
  },
  {
    name: 'Ultimate Guard Katana Sleeves Standard (100) - Crimson Red',
    slug: 'ug-katana-sleeves-standard-crimson-red',
    brand: 'Ultimate Guard',
    game: null,
    category: 'sleeves',
    sku: 'UGD011102',
    ean: '4056133011102',
    price_huf: 4290,
    original_price_huf: null,
    stock_quantity: 18,
    status: 'active',
    is_featured: false,
    variant_group: 'ug-katana-std-100',
    variant_label: 'Crimson Red',
    variant_kind: 'color',
    description: 'Precision-crafted Japanese sleeves in bold Crimson Red. Smooth tournament shuffling and full opacity.',
    images: ['https://images.unsplash.com/photo-1541701494587-cb58502866ab?auto=format&fit=crop&w=600&q=80'],
    attributes: { size: 'standard', color: 'Crimson Red', count: 100 },
    private: { supplier: 'Heo Distribution', cost_price_huf: 2750 }
  },
  {
    name: 'Ultimate Guard Katana Sleeves Standard (100) - Sapphire Blue',
    slug: 'ug-katana-sleeves-standard-sapphire-blue',
    brand: 'Ultimate Guard',
    game: null,
    category: 'sleeves',
    sku: 'UGD011103',
    ean: '4056133011103',
    price_huf: 4290,
    original_price_huf: null,
    stock_quantity: 14,
    status: 'active',
    is_featured: false,
    variant_group: 'ug-katana-std-100',
    variant_label: 'Sapphire Blue',
    variant_kind: 'color',
    description: 'Precision-crafted Japanese sleeves in vivid Sapphire Blue. Perfect protection for MTG, Pokemon, Riftbound.',
    images: ['https://images.unsplash.com/photo-1579546929518-9e396f3cc809?auto=format&fit=crop&w=600&q=80'],
    attributes: { size: 'standard', color: 'Sapphire Blue', count: 100 },
    private: { supplier: 'Heo Distribution', cost_price_huf: 2750 }
  },
  {
    name: 'Ultimate Guard Katana Sleeves Standard (100) - Emerald Green',
    slug: 'ug-katana-sleeves-standard-emerald-green',
    brand: 'Ultimate Guard',
    game: null,
    category: 'sleeves',
    sku: 'UGD011104',
    ean: '4056133011104',
    price_huf: 4290,
    original_price_huf: null,
    stock_quantity: 9,
    status: 'active',
    is_featured: false,
    variant_group: 'ug-katana-std-100',
    variant_label: 'Emerald Green',
    variant_kind: 'color',
    description: 'Precision-crafted Japanese sleeves in Emerald Green. Acid free, no PVC.',
    images: ['https://images.unsplash.com/photo-1550684848-fac1c5b4e853?auto=format&fit=crop&w=600&q=80'],
    attributes: { size: 'standard', color: 'Emerald Green', count: 100 },
    private: { supplier: 'Heo Distribution', cost_price_huf: 2750 }
  },
  {
    name: 'Ultimate Guard Katana Sleeves Standard (100) - Shinto White',
    slug: 'ug-katana-sleeves-standard-shinto-white',
    brand: 'Ultimate Guard',
    game: null,
    category: 'sleeves',
    sku: 'UGD011105',
    ean: '4056133011105',
    price_huf: 4290,
    original_price_huf: null,
    stock_quantity: 0,
    status: 'out_of_stock',
    is_featured: false,
    variant_group: 'ug-katana-std-100',
    variant_label: 'Shinto White',
    variant_kind: 'color',
    description: 'Precision-crafted Japanese sleeves in pristine Shinto White. Currently out of stock, restocking soon.',
    images: ['https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=600&q=80'],
    attributes: { size: 'standard', color: 'Shinto White', count: 100 },
    private: { supplier: 'Heo Distribution', cost_price_huf: 2750 }
  },

  // 3. Dragon Shield Matte Japanese Size (Variant group: ds-matte-jp-60, kind: color)
  {
    name: 'Dragon Shield Matte Japanese (60) - Slate',
    slug: 'dragon-shield-matte-japanese-slate',
    brand: 'Dragon Shield',
    game: null,
    category: 'sleeves',
    sku: 'AT-11120',
    ean: '5706569111201',
    price_huf: 3290,
    original_price_huf: null,
    stock_quantity: 15,
    status: 'active',
    is_featured: false,
    variant_group: 'ds-matte-jp-60',
    variant_label: 'Slate',
    variant_kind: 'color',
    description: 'Matte Japanese size sleeves for Yu-Gi-Oh and Cardfight Vanguard. Textured back with superb handling.',
    images: ['https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?auto=format&fit=crop&w=600&q=80'],
    attributes: { size: 'japanese', color: 'Slate', count: 60 },
    private: { supplier: 'Arcane Tinmen', cost_price_huf: 2100 }
  },
  {
    name: 'Dragon Shield Matte Japanese (60) - Ruby',
    slug: 'dragon-shield-matte-japanese-ruby',
    brand: 'Dragon Shield',
    game: null,
    category: 'sleeves',
    sku: 'AT-11121',
    ean: '5706569111218',
    price_huf: 3290,
    original_price_huf: null,
    stock_quantity: 11,
    status: 'active',
    is_featured: false,
    variant_group: 'ds-matte-jp-60',
    variant_label: 'Ruby',
    variant_kind: 'color',
    description: 'Matte Japanese size sleeves in rich Ruby red. 60 sleeves per box with sturdy cardboard deck storage box.',
    images: ['https://images.unsplash.com/photo-1541701494587-cb58502866ab?auto=format&fit=crop&w=600&q=80'],
    attributes: { size: 'japanese', color: 'Ruby', count: 60 },
    private: { supplier: 'Arcane Tinmen', cost_price_huf: 2100 }
  },

  // 4. Deck Boxes - Ultimate Guard Sidewinder 100+ XenoSkin (Variant group: ug-sidewinder-100, kind: color)
  {
    name: 'Ultimate Guard Sidewinder 100+ XenoSkin - Monolith Black',
    slug: 'ug-sidewinder-100-monolith-black',
    brand: 'Ultimate Guard',
    game: null,
    category: 'deck_boxes',
    sku: 'UGD010801',
    ean: '4056133010801',
    price_huf: 7490,
    original_price_huf: 7990,
    stock_quantity: 7,
    status: 'active',
    is_featured: true,
    variant_group: 'ug-sidewinder-100',
    variant_label: 'Monolith Black',
    variant_kind: 'color',
    description: 'Premium deck box holds up to 100 double-sleeved cards. Innovative XenoSkin anti-slip texture with microfibre inner lining and strong magnetic closure.',
    images: ['https://images.unsplash.com/photo-1586023492125-27b2c045efd7?auto=format&fit=crop&w=600&q=80'],
    attributes: { capacity: '100+ double-sleeved', material: 'XenoSkin', color: 'Monolith Black' },
    private: { supplier: 'Heo Distribution', cost_price_huf: 4900 }
  },
  {
    name: 'Ultimate Guard Sidewinder 100+ XenoSkin - Petrol Blue',
    slug: 'ug-sidewinder-100-petrol-blue',
    brand: 'Ultimate Guard',
    game: null,
    category: 'deck_boxes',
    sku: 'UGD010802',
    ean: '4056133010802',
    price_huf: 7490,
    original_price_huf: null,
    stock_quantity: 5,
    status: 'active',
    is_featured: false,
    variant_group: 'ug-sidewinder-100',
    variant_label: 'Petrol Blue',
    variant_kind: 'color',
    description: 'Premium deck box in stylish Petrol Blue. Wide easy-access opening with 4-magnet closure.',
    images: ['https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=600&q=80'],
    attributes: { capacity: '100+ double-sleeved', material: 'XenoSkin', color: 'Petrol Blue' },
    private: { supplier: 'Heo Distribution', cost_price_huf: 4900 }
  },

  // 5. Binders - Ultimate Guard Zipfolio 360 (Variant group: ug-zipfolio-360, kind: color)
  {
    name: 'Ultimate Guard Zipfolio 360 XenoSkin 9-Pocket - Black',
    slug: 'ug-zipfolio-360-xenoskin-black',
    brand: 'Ultimate Guard',
    game: null,
    category: 'binders',
    sku: 'UGD010601',
    ean: '4056133010601',
    price_huf: 11490,
    original_price_huf: 12990,
    stock_quantity: 6,
    status: 'active',
    is_featured: true,
    variant_group: 'ug-zipfolio-360',
    variant_label: 'Black',
    variant_kind: 'color',
    description: 'Zippered 9-pocket album with 20 integrated 18-pocket pages (360 cards total). Side-loading pockets prevent cards from falling out.',
    images: ['https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=600&q=80'],
    attributes: { pockets: 360, closure: 'Zipper', material: 'XenoSkin', color: 'Black' },
    private: { supplier: 'Heo Distribution', cost_price_huf: 7400 }
  },
  {
    name: 'Ultimate Guard Zipfolio 360 XenoSkin 9-Pocket - Petrol Blue',
    slug: 'ug-zipfolio-360-xenoskin-petrol-blue',
    brand: 'Ultimate Guard',
    game: null,
    category: 'binders',
    sku: 'UGD010602',
    ean: '4056133010602',
    price_huf: 11490,
    original_price_huf: null,
    stock_quantity: 4,
    status: 'active',
    is_featured: false,
    variant_group: 'ug-zipfolio-360',
    variant_label: 'Petrol Blue',
    variant_kind: 'color',
    description: 'Zippered 9-pocket album in Petrol Blue. 20 archival-grade pages with side-loading design.',
    images: ['https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=600&q=80'],
    attributes: { pockets: 360, closure: 'Zipper', material: 'XenoSkin', color: 'Petrol Blue' },
    private: { supplier: 'Heo Distribution', cost_price_huf: 7400 }
  },

  // 6. Playmats
  {
    name: 'Ultimate Guard Playmat Monochrome - Solid Black (61x35 cm)',
    slug: 'ug-playmat-monochrome-black',
    brand: 'Ultimate Guard',
    game: null,
    category: 'playmats',
    sku: 'UGD010401',
    ean: '4056133010401',
    price_huf: 5490,
    original_price_huf: null,
    stock_quantity: 11,
    status: 'active',
    is_featured: false,
    variant_group: null,
    variant_label: null,
    variant_kind: null,
    description: 'High-grade soft cushioned gaming mat with anti-slip rubber back side. Protects cards and accessories during tournament play.',
    images: ['https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=600&q=80'],
    attributes: { dimensions: '61x35 cm', thickness: '2 mm', surface: 'Fabric' },
    private: { supplier: 'Heo Distribution', cost_price_huf: 3200 }
  },
  {
    name: 'Riftbound Official Summoner Arena Playmat (Stitched Edge)',
    slug: 'riftbound-summoner-arena-playmat',
    brand: 'Riot Games',
    game: 'riftbound',
    category: 'playmats',
    sku: 'RB-MAT-ARENA',
    ean: '5901234567102',
    price_huf: 8990,
    original_price_huf: 9990,
    stock_quantity: 8,
    status: 'active',
    is_featured: true,
    variant_group: null,
    variant_label: null,
    variant_kind: null,
    description: 'Official tournament playmat with premium stitched edges and high-definition summoner battlefield zones for Riftbound TCG.',
    images: ['https://pub-fc12cf26538b49798ca89e43c2bf3c4a.r2.dev/riftbound/rad-122.webp'],
    attributes: { dimensions: '61x35 cm', stitched: true, game: 'Riftbound' },
    private: { supplier: 'Blackfire EU', cost_price_huf: 5500 }
  },

  // 7. Protection / Toploaders
  {
    name: 'Ultimate Guard Toploading Card Holders Standard (25 pcs)',
    slug: 'ug-toploaders-standard-25',
    brand: 'Ultimate Guard',
    game: null,
    category: 'protection',
    sku: 'UGD010101',
    ean: '4056133010101',
    price_huf: 2490,
    original_price_huf: null,
    stock_quantity: 35,
    status: 'active',
    is_featured: false,
    variant_group: null,
    variant_label: null,
    variant_kind: null,
    description: 'Rigid plastic card protectors for standard sized cards (63.5 x 88.9 mm). Protects cards from bends, scratches and physical damage during shipping and display.',
    images: ['https://images.unsplash.com/photo-1586023492125-27b2c045efd7?auto=format&fit=crop&w=600&q=80'],
    attributes: { count: 25, thickness: '35pt', clarity: 'Ultra Clear' },
    private: { supplier: 'Heo Distribution', cost_price_huf: 1450 }
  },

  // 8. Dice
  {
    name: 'Chessex Gemini Polyhedral 7-Die Set - Black & Starlight Red',
    slug: 'chessex-gemini-7die-black-red',
    brand: 'Other',
    game: null,
    category: 'dice',
    sku: 'CHX-26424',
    ean: '601982026424',
    price_huf: 3990,
    original_price_huf: null,
    stock_quantity: 14,
    status: 'active',
    is_featured: false,
    variant_group: null,
    variant_label: null,
    variant_kind: null,
    description: 'Complete 7-die set (d4, d6, d8, d10, d%, d12, d20) in translucent gemini swirl finish with crisp gold numbering. Includes storage case.',
    images: ['https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&w=600&q=80'],
    attributes: { count: 7, material: 'Acrylic Swirl', numbering: 'Gold' },
    private: { supplier: 'Fantasy Flight Games', cost_price_huf: 2200 }
  },

  // 9. Draft Product for Admin testing
  {
    name: 'Ultimate Guard Superhive 550+ XenoSkin - Black (Upcoming)',
    slug: 'ug-superhive-550-black',
    brand: 'Ultimate Guard',
    game: null,
    category: 'storage',
    sku: 'UGD010999',
    ean: '4056133010999',
    price_huf: 24990,
    original_price_huf: null,
    stock_quantity: 3,
    status: 'draft',
    is_featured: false,
    variant_group: null,
    variant_label: null,
    variant_kind: null,
    description: 'Draft listing for upcoming shipment. Holds multiple deck cases, playmats, and accessories in a single rugged vault.',
    images: ['https://images.unsplash.com/photo-1586023492125-27b2c045efd7?auto=format&fit=crop&w=600&q=80'],
    attributes: { capacity: '550+ double-sleeved cards + 2 playmats', material: 'XenoSkin' },
    private: { supplier: 'Heo Distribution', cost_price_huf: 16500 }
  }
];

async function seed() {
  console.log(`Starting mock store seed (${MOCK_PRODUCTS.length} products)...`);

  for (const item of MOCK_PRODUCTS) {
    const { private: priv, ...prod } = item;

    // Check if product with slug already exists
    const checkRes = await fetch(`${SUPABASE_URL}/rest/v1/store_products?slug=eq.${encodeURIComponent(prod.slug)}&select=id`, {
      headers
    });
    const existing = await checkRes.json();

    let productId;
    if (existing && existing.length > 0) {
      productId = existing[0].id;
      // Update
      const updateRes = await fetch(`${SUPABASE_URL}/rest/v1/store_products?id=eq.${productId}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ ...prod, updated_at: new Date().toISOString() })
      });
      if (!updateRes.ok) {
        console.error(`Failed to update ${prod.slug}:`, await updateRes.text());
        continue;
      }
      console.log(`Updated product: ${prod.slug}`);
    } else {
      // Insert
      const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/store_products`, {
        method: 'POST',
        headers,
        body: JSON.stringify(prod)
      });
      if (!insertRes.ok) {
        console.error(`Failed to insert ${prod.slug}:`, await insertRes.text());
        continue;
      }
      const inserted = await insertRes.json();
      productId = inserted[0]?.id;
      console.log(`Created product: ${prod.slug} (${productId})`);
    }

    if (productId && priv) {
      const privPayload = {
        product_id: productId,
        supplier: priv.supplier,
        cost_price_huf: priv.cost_price_huf,
        updated_at: new Date().toISOString()
      };
      // Upsert into store_product_private
      const privRes = await fetch(`${SUPABASE_URL}/rest/v1/store_product_private`, {
        method: 'POST',
        headers: {
          ...headers,
          Prefer: 'resolution=merge-duplicates'
        },
        body: JSON.stringify(privPayload)
      });
      if (!privRes.ok) {
        console.warn(`Private cost upsert notice for ${prod.slug}:`, await privRes.text());
      }
    }
  }

  console.log('Seed completed successfully!');
}

seed().catch(err => {
  console.error('Fatal seed error:', err);
  process.exit(1);
});
