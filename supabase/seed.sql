-- ─────────────────────────────────────────
-- VERB App — Seed Data
-- Run AFTER schema.sql
-- ─────────────────────────────────────────

-- Clients
INSERT INTO clients (name, slug, color_hex, drive_url) VALUES
  ('FlavCity',       'flavcity',       '#15803D', 'https://drive.google.com/drive/folders/18NYtPsy68MvKxsWotZ9MlkZePGswiwqE'),
  ('Chomps',         'chomps',         '#BE123C', 'https://drive.google.com/drive/folders/1piDRkGhAL9T5ZzYxAu2TB-7I6_payRR3'),
  ('Himapure',       'himapure',       '#C2410C', 'https://drive.google.com/drive/folders/1hlRYGN2JNiEJfY1SLTWxybq8C5Qgm9pX'),
  ('Home & Laundry', 'home-laundry',   '#1D4ED8', 'https://drive.google.com/drive/folders/1SqnPo4Mybwy24vfL0yC8aQEppS1_sz83'),
  ('Dupes & Co',     'dupes-co',       '#6D28D9', 'https://drive.google.com/drive/folders/1LzJ3ots94pcKmVf2BlJNg6r1jlxfvI6c'),
  ('Biom',           'biom',           '#0E7490', 'https://drive.google.com/drive/folders/1u898hhJHWqhDu51V3P2Yvm70-qstVp93'),
  ('FaceTub',        'facetub',        '#A16207', 'https://drive.google.com/drive/folders/1GHcnujinkWL3IHsQcJeGbVNWlv_WXLgb');

-- Products (using subquery to get client IDs)
DO $$
DECLARE
  fc UUID; ch UUID; hi UUID; hl UUID; dc UUID; bi UUID; ft UUID;
BEGIN
  SELECT id INTO fc FROM clients WHERE slug='flavcity';
  SELECT id INTO ch FROM clients WHERE slug='chomps';
  SELECT id INTO hi FROM clients WHERE slug='himapure';
  SELECT id INTO hl FROM clients WHERE slug='home-laundry';
  SELECT id INTO dc FROM clients WHERE slug='dupes-co';
  SELECT id INTO bi FROM clients WHERE slug='biom';
  SELECT id INTO ft FROM clients WHERE slug='facetub';

  INSERT INTO products (client_id, name, sort_order) VALUES
    -- FlavCity
    (fc,'Vanilla Cream',1),(fc,'Chocolate',2),(fc,'Chocolate Peanut Butter',3),
    (fc,'Berries & Cream',4),(fc,'Butter Coffee',5),(fc,'Brownie Batter',6),
    (fc,'Cookies & Cream',7),(fc,'Mint Chocolate',8),(fc,'Cinnamon Roll',9),
    (fc,'Pineapple Coconut',10),(fc,'Banana Bread',11),(fc,'Blueberry Muffin',12),
    (fc,'Salted Caramel',13),(fc,'Sampler Pack',14),(fc,'Shaker Bottles',15),
    (fc,'Electrolyte Packs',16),
    -- Chomps
    (ch,'Original Beef',1),(ch,'Smokey BBQ Beef',2),(ch,'Sea Salt Beef',3),
    (ch,'Salt & Pepper Venison',4),(ch,'Jalapeño Beef',5),(ch,'Taco Seasoned Beef',6),
    (ch,'Original Turkey',7),(ch,'Variety Pack',8),
    -- Himapure
    (hi,'Himalayan Honey (2lb Tub)',1),
    -- Home & Laundry
    (hl,'Laundry Lovers Bundle',1),(hl,'Ocean Breeze Laundry Detergent Sheets',2),
    (hl,'Dishwashing Eco Pods',3),(hl,'Whole Home Eco Bundle',4),
    (hl,'Tropical Laundry Eco Pods',5),(hl,'Lemon Detergent Eco Sheets for Dishwashing',6),
    -- Dupes & Co
    (dc,'Sun Bliss Conditioner',1),(dc,'Caramel Cream Lip Balm',2),
    (dc,'Lip Balm 2 Pack (Caramel Cream & Watermelon Burst)',3),
    (dc,'Enigmatic Pulse Eau de Parfum',4),(dc,'Sun Bliss Body Wash',5),
    (dc,'Sun Bliss Body Mist',6),(dc,'Sun Bliss Body Cream',7),(dc,'Sun Bliss Shampoo',8),
    -- Biom
    (bi,'All Purpose Wipes',1),(bi,'Disinfecting Wipes',2),
    (bi,'Baby Wipes',3),(bi,'Flushable Wipes',4),
    -- FaceTub
    (ft,'FaceTub',1);
END $$;
