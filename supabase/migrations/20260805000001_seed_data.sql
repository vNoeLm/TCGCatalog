-- Create Sets
INSERT INTO public.sets (id, code, name, release_date, total_cards) VALUES
  ('11111111-1111-1111-1111-111111111111', 'BP01', 'Dawn of Palpagos', '2024-01-01', 80),
  ('22222222-2222-2222-2222-222222222222', 'BP02', 'Legends Awaken', '2024-04-01', 120)
ON CONFLICT (code) DO NOTHING;

-- Create Cards
INSERT INTO public.cards (id, set_id, card_number, name, rarity, color, card_type, cost, is_lucky, image_path) VALUES
  -- Dawn of Palpagos Cards
  ('33333333-3333-3333-3333-333333333331', '11111111-1111-1111-1111-111111111111', 'bp01-001', 'Grizzbolt', 'rr', 'blue', 'pal', 5, false, null),
  ('33333333-3333-3333-3333-333333333332', '11111111-1111-1111-1111-111111111111', 'bp01-005', 'Lifmunk', 'u', 'green', 'pal', 1, true, null),
  ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 'bp01-012', 'Mega Sphere', 'c', 'colorless', 'gear', 2, false, null),
  ('33333333-3333-3333-3333-333333333334', '11111111-1111-1111-1111-111111111111', 'bp01-020', 'Verdant Festival', 'r', 'green', 'event', 3, false, null),
  ('33333333-3333-3333-3333-333333333335', '11111111-1111-1111-1111-111111111111', 'bp01-033', 'Jormuntide Ignis', 'osr', 'red', 'pal', 7, false, null),
  ('33333333-3333-3333-3333-333333333336', '11111111-1111-1111-1111-111111111111', 'bp01-ssp01', 'Shadowbeak', 'ssp', 'purple', 'pal', 9, false, null),
  
  -- Legends Awaken Cards
  ('33333333-3333-3333-3333-333333333337', '22222222-2222-2222-2222-222222222222', 'bp02-001', 'Frostallion', 'sr', 'blue', 'pal', 8, false, null),
  ('33333333-3333-3333-3333-333333333338', '22222222-2222-2222-2222-222222222222', 'bp02-010', 'Jetragon', 'ssp', 'purple', 'pal', 10, true, null),
  ('33333333-3333-3333-3333-333333333339', '22222222-2222-2222-2222-222222222222', 'bp02-020', 'Flame Striker', 'rr', 'red', 'pal', 6, false, null),
  ('33333333-3333-3333-3333-333333333340', '22222222-2222-2222-2222-222222222222', 'bp02-030', 'Thunder Call', 'r', 'blue', 'event', 3, false, null)
ON CONFLICT (id) DO NOTHING;

-- Create Inventory Entries
INSERT INTO public.inventory (card_id, condition, is_foil, price_huf, status, notes) VALUES
  -- Grizzbolt (2 in stock, 1 sold)
  ('33333333-3333-3333-3333-333333333331', 'Near Mint', false, 15000.00, 'In Stock', 'Freshly pulled'),
  ('33333333-3333-3333-3333-333333333331', 'Lightly Played', false, 12000.00, 'In Stock', 'Slight edge wear'),
  ('33333333-3333-3333-3333-333333333331', 'Mint', true, 25000.00, 'Sold', 'Foil version'),
  
  -- Lifmunk
  ('33333333-3333-3333-3333-333333333332', 'Mint', false, 5000.00, 'In Stock', 'Lucky!'),
  
  -- Mega Sphere
  ('33333333-3333-3333-3333-333333333333', 'Near Mint', false, 500.00, 'In Stock', null),
  ('33333333-3333-3333-3333-333333333333', 'Near Mint', false, 500.00, 'In Stock', null),
  
  -- Verdant Festival
  ('33333333-3333-3333-3333-333333333334', 'Mint', false, 2500.00, 'Reserved', 'On hold for customer'),
  
  -- Jormuntide Ignis
  ('33333333-3333-3333-3333-333333333335', 'Near Mint', true, 35000.00, 'In Stock', 'Beautiful holo pattern'),
  
  -- Shadowbeak
  ('33333333-3333-3333-3333-333333333336', 'Mint', true, 85000.00, 'In Stock', 'SSP Chase Card!'),

  -- Frostallion
  ('33333333-3333-3333-3333-333333333337', 'Near Mint', false, 45000.00, 'In Stock', null),
  
  -- Jetragon
  ('33333333-3333-3333-3333-333333333338', 'Mint', true, 120000.00, 'In Stock', 'Flawless condition, SSP Lucky'),
  
  -- Flame Striker
  ('33333333-3333-3333-3333-333333333339', 'Lightly Played', false, 12000.00, 'In Stock', null),
  
  -- Thunder Call
  ('33333333-3333-3333-3333-333333333340', 'Near Mint', false, 1800.00, 'In Stock', null);
