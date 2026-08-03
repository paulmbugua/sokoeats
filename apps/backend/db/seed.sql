INSERT INTO sokoeats_users (name, email, phone, role) VALUES
  ('Amina Customer', 'amina@sokoeats.local', '+254700111222', 'customer'),
  ('Urban Bowls Vendor', 'vendor@sokoeats.local', '+254700333444', 'vendor'),
  ('Sokoeats Support', 'support@sokoeats.local', '+254700555666', 'support')
ON CONFLICT (email) DO NOTHING;

WITH owner AS (SELECT id FROM sokoeats_users WHERE email = 'vendor@sokoeats.local')
INSERT INTO sokoeats_vendors (owner_user_id, name, slug, cuisine, status, rating, prep_minutes, delivery_fee, minimum_order, address) VALUES
  ((SELECT id FROM owner), 'Urban Bowls', 'urban-bowls', 'Healthy bowls', 'active', 4.8, 18, 120, 450, 'Westlands'),
  ((SELECT id FROM owner), 'Mama Nia Kitchen', 'mama-nia-kitchen', 'Kenyan comfort', 'active', 4.9, 28, 160, 350, 'Kilimani'),
  ((SELECT id FROM owner), 'Taco Moto', 'taco-moto', 'Street tacos', 'active', 4.6, 22, 140, 500, 'CBD')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO sokoeats_menu_items (vendor_id, name, description, price, category, popular)
SELECT v.id, item.name, item.description, item.price, item.category, item.popular
FROM sokoeats_vendors v
JOIN (VALUES
  ('urban-bowls', 'Glow Bowl', 'Avocado, grilled chicken, greens, sesame crunch.', 980, 'Bowls', true),
  ('urban-bowls', 'Mango Chili Juice', 'Cold pressed mango, lime, chili salt.', 280, 'Drinks', false),
  ('mama-nia-kitchen', 'Nyama Plate', 'Tender beef stew, sukuma, kachumbari, and chapati.', 860, 'Mains', true),
  ('mama-nia-kitchen', 'Pilau Feast', 'Spiced rice, beef cubes, slaw, and house sauce.', 740, 'Mains', false),
  ('taco-moto', 'Fire Trio Tacos', 'Three beef tacos with salsa verde and smoky crema.', 790, 'Tacos', true),
  ('taco-moto', 'Loaded Nachos', 'Crisp nachos with beans, cheese, pico, and jalapeno.', 690, 'Sides', false)
) AS item(slug, name, description, price, category, popular) ON item.slug = v.slug
WHERE NOT EXISTS (SELECT 1 FROM sokoeats_menu_items mi WHERE mi.vendor_id = v.id AND mi.name = item.name);
