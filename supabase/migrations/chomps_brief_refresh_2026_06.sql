-- ─────────────────────────────────────────
-- Chomps Creator Brief Refresh — June 2026
-- Reorders existing brief sections, fixes the Pepperoni Turkey
-- revival date, adds 4 new sections, and syncs the flavor lineup
-- into the products table. Safe to re-run (idempotent).
-- ─────────────────────────────────────────

DO $$
DECLARE ch UUID;
BEGIN
  SELECT id INTO ch FROM clients WHERE slug = 'chomps';

  -- 1) Re-order existing sections to make room for the new ones
  UPDATE brief_sections SET sort_order = 1  WHERE client_id = ch AND title = 'Mission';
  UPDATE brief_sections SET sort_order = 2  WHERE client_id = ch AND title = 'Brand Summary';
  UPDATE brief_sections SET sort_order = 3  WHERE client_id = ch AND title = 'Audience & Mindset';
  UPDATE brief_sections SET sort_order = 5  WHERE client_id = ch AND title = 'Brand Voice';
  UPDATE brief_sections SET sort_order = 6  WHERE client_id = ch AND title = 'Creator Persona: Evidence-Based Fitness & Nutrition';
  UPDATE brief_sections SET sort_order = 7  WHERE client_id = ch AND title = 'Creator Persona: Everyday Active Achiever';
  UPDATE brief_sections SET sort_order = 8  WHERE client_id = ch AND title = 'Creator Persona: Simplified Wellness & Routine';
  UPDATE brief_sections SET sort_order = 10 WHERE client_id = ch AND title = 'Visual & Filming Guidelines';
  UPDATE brief_sections SET sort_order = 13 WHERE client_id = ch AND title = 'Execution Rules';
  UPDATE brief_sections SET sort_order = 14 WHERE client_id = ch AND title = 'Do''s & Don''ts';

  -- 2) Fix Pepperoni Turkey revival date (May -> July 2026)
  UPDATE brief_sections
     SET content = REPLACE(content, 'being revived May 2026', 'being revived July 2026')
   WHERE client_id = ch AND title = 'Do''s & Don''ts';

  -- 3) Clear any prior copies of the new sections so re-runs stay clean
  DELETE FROM brief_sections
   WHERE client_id = ch
     AND title IN (
       'Top Claim Priority',
       'Flavor Lineup',
       'Organic Content Guidelines',
       'Affiliate Creator Guidelines'
     );

  -- 4) Insert the new sections
  INSERT INTO brief_sections (client_id, title, content, sort_order) VALUES
  (ch, 'Top Claim Priority', $md$Claims ranked by priority. When space or attention is limited, lead with what's highest on the list.

• 1 — Protein
• 2 — Made with real ingredients
• 3 — Taste
• 4 — 0 grams of sugar
• 5 — Sourcing$md$, 4),

  (ch, 'Flavor Lineup', $md$The full Chomps flavor lineup. Check SKU availability and timing flags before featuring.

**BEEF**
• Original Beef
• Jalapeño Beef
• Smoky BBQ Beef
• Sea Salt Beef
• Taco Seasoned Beef
• Habanero Beef *(D2C only — do not feature in retail/general content)*
• Italian Style Beef *(D2C only — do not feature in retail/general content)*

**TURKEY**
• Original Turkey
• Pepperoni Turkey *(revived July 2026 — do not reference until then)*

**VENISON**
• Salt & Pepper Venison

**CHICKEN**
• Original Chicken
• Nashville Hot Seasoned Chicken
• Savory Breakfast Chicken

**NOTE**
Jalapeño Turkey is being sunset — do not reference for now.$md$, 9),

  (ch, 'Organic Content Guidelines', $md$Standards for organic (non-paid) creator content so it feels native to the platform and stays compliant.

**LOOK & FONT**
• Use a native classic font with a black stroke outline
• Avoid branded fonts (e.g. Mindset) — content should feel native to the platform, not like an ad
• Make sure the product and packaging look stellar; avoid showing overly ripped packaging

**TONE**
• Keep content positive, motivating, educational, and inspiring
• Avoid any health-shaming content
• Creators should match our Active Achiever archetype

**HARD RULES**
• Only use approved claims and language
• Do not include or reference pets in content

**LEGAL**
• No non-commercially available audio or music (e.g. the Charli XCX "Rock Music" trend that was pulled)
• No celebrity or macro-influencer likeness (e.g. the Justin Bieber Coachella meme that was pulled)

**BOOSTED CONTENT**
• Check in on boosted content to pause/remove anything time-dependent from the queue (e.g. St. Patrick's Day, March Produce Guide, etc.)

**COMMENTS (OWNED + AFFILIATE)**
• All comments on affiliate content, or in response to Eleven Signal published/boosted content, should align with Chomps' updated TOV (see TOV Guidelines PDF)
• Avoid defaulting to only the beef emoji — with Chicken, Turkey, Venison and more in content, an auto beef emoji feels off when a different SKU is featured$md$, 11),

  (ch, 'Affiliate Creator Guidelines', $md$Selection standards for creators in affiliate campaigns.

**PRIORITIZE**
• Brand-safe and aligned creators
• Alignment with the Active Achiever archetype whenever possible

**AVOID CREATORS WHO FEATURE**
• NSFW content
• Innuendos, swimsuits, guns, etc.
• Heavily political content
• Heavily religious content
• Pets
• Overly clicky / rage-baity hooks$md$, 12);

  -- 5) Sync flavor lineup into products.
  --    Reconcile the legacy 'Nashville Hot Chicken' name with the official
  --    'Nashville Hot Seasoned Chicken' lineup name, preserving its assets.
  DELETE FROM products
   WHERE client_id = ch AND name = 'Nashville Hot Seasoned Chicken'
     AND NOT EXISTS (SELECT 1 FROM assets a WHERE a.product_id = products.id);
  UPDATE products SET name = 'Nashville Hot Seasoned Chicken'
   WHERE client_id = ch AND name = 'Nashville Hot Chicken';

  -- Insert any flavors still missing from the products table
  INSERT INTO products (client_id, name)
  SELECT ch, v.name
  FROM (VALUES
    ('Habanero Beef'),
    ('Italian Style Beef'),
    ('Pepperoni Turkey'),
    ('Original Chicken'),
    ('Nashville Hot Seasoned Chicken'),
    ('Savory Breakfast Chicken')
  ) AS v(name)
  WHERE NOT EXISTS (
    SELECT 1 FROM products p WHERE p.client_id = ch AND p.name = v.name
  );

  -- 6) Clean, lineup-ordered sort_order (bundles last)
  UPDATE products SET sort_order = 1  WHERE client_id = ch AND name = 'Original Beef';
  UPDATE products SET sort_order = 2  WHERE client_id = ch AND name = 'Jalapeño Beef';
  UPDATE products SET sort_order = 3  WHERE client_id = ch AND name = 'Smokey BBQ Beef';
  UPDATE products SET sort_order = 4  WHERE client_id = ch AND name = 'Sea Salt Beef';
  UPDATE products SET sort_order = 5  WHERE client_id = ch AND name = 'Taco Seasoned Beef';
  UPDATE products SET sort_order = 6  WHERE client_id = ch AND name = 'Habanero Beef';
  UPDATE products SET sort_order = 7  WHERE client_id = ch AND name = 'Italian Style Beef';
  UPDATE products SET sort_order = 8  WHERE client_id = ch AND name = 'Original Turkey';
  UPDATE products SET sort_order = 9  WHERE client_id = ch AND name = 'Pepperoni Turkey';
  UPDATE products SET sort_order = 10 WHERE client_id = ch AND name = 'Salt & Pepper Venison';
  UPDATE products SET sort_order = 11 WHERE client_id = ch AND name = 'Original Chicken';
  UPDATE products SET sort_order = 12 WHERE client_id = ch AND name = 'Nashville Hot Seasoned Chicken';
  UPDATE products SET sort_order = 13 WHERE client_id = ch AND name = 'Savory Breakfast Chicken';
  UPDATE products SET sort_order = 14 WHERE client_id = ch AND name = 'Variety Pack';
  UPDATE products SET sort_order = 15 WHERE client_id = ch AND name = 'Chicken Trial Pack';
END $$;
