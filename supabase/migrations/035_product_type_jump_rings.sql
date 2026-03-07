-- 035_product_type_jump_rings.sql
-- Add jump_rings_required column to product_types

ALTER TABLE product_types ADD COLUMN IF NOT EXISTS jump_rings_required INTEGER DEFAULT 1;

-- Hand Chain typically needs 2 jump rings
UPDATE product_types SET jump_rings_required = 2 WHERE LOWER(name) = 'hand chain';
