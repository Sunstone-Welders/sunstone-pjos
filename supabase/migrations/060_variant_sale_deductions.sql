-- ============================================================================
-- Migration 060: Variant-Aware Sale Deductions
-- ============================================================================
-- Updates create_sale_transaction and decrement_inventory to support
-- inventory_item_variants. When a variant_id is provided, deduction targets
-- the variant row and recalculates the parent item's quantity_on_hand as
-- SUM of its active variants.
-- ============================================================================

-- ============================================================================
-- 1. decrement_inventory — Add optional p_variant_id parameter
-- ============================================================================

CREATE OR REPLACE FUNCTION decrement_inventory(
  p_item_id UUID,
  p_amount NUMERIC,
  p_tenant_id UUID,
  p_movement_type TEXT DEFAULT NULL,
  p_reference_id UUID DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_performed_by UUID DEFAULT NULL,
  p_variant_id UUID DEFAULT NULL
)
RETURNS NUMERIC AS $$
DECLARE
  new_qty NUMERIC;
  parent_qty NUMERIC;
BEGIN
  -- Auth check
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Tenant membership check
  IF NOT EXISTS (
    SELECT 1 FROM tenant_members
    WHERE user_id = auth.uid() AND tenant_id = p_tenant_id
  ) THEN
    RAISE EXCEPTION 'Not a member of this tenant';
  END IF;

  IF p_variant_id IS NOT NULL THEN
    -- Variant-aware deduction
    UPDATE inventory_item_variants
    SET quantity_on_hand = GREATEST(quantity_on_hand - p_amount, 0),
        updated_at = NOW()
    WHERE id = p_variant_id
      AND inventory_item_id = p_item_id
    RETURNING quantity_on_hand INTO new_qty;

    -- Recalc parent quantity_on_hand = SUM of active variants
    SELECT COALESCE(SUM(quantity_on_hand), 0) INTO parent_qty
    FROM inventory_item_variants
    WHERE inventory_item_id = p_item_id AND is_active = true;

    UPDATE inventory_items
    SET quantity_on_hand = parent_qty, updated_at = NOW()
    WHERE id = p_item_id AND tenant_id = p_tenant_id;
  ELSE
    -- Original behavior: deduct from parent item directly
    UPDATE inventory_items
    SET quantity_on_hand = GREATEST(quantity_on_hand - p_amount, 0),
        updated_at = NOW()
    WHERE id = p_item_id
      AND tenant_id = p_tenant_id
    RETURNING quantity_on_hand INTO new_qty;
  END IF;

  -- Optionally log inventory movement
  IF p_movement_type IS NOT NULL THEN
    INSERT INTO inventory_movements (
      tenant_id, inventory_item_id, inventory_variant_id, movement_type,
      quantity, reference_id, notes, performed_by
    ) VALUES (
      p_tenant_id,
      p_item_id,
      p_variant_id,
      p_movement_type::movement_type,
      -p_amount,
      p_reference_id,
      p_notes,
      p_performed_by
    );
  END IF;

  RETURN COALESCE(new_qty, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 2. create_sale_transaction — Variant-aware sale items + deductions
-- ============================================================================

CREATE OR REPLACE FUNCTION create_sale_transaction(
  p_tenant_id UUID,
  p_event_id UUID,
  p_client_id UUID,
  p_subtotal NUMERIC,
  p_discount_amount NUMERIC,
  p_tax_amount NUMERIC,
  p_tip_amount NUMERIC,
  p_platform_fee_amount NUMERIC,
  p_total NUMERIC,
  p_payment_method TEXT,
  p_payment_status TEXT,
  p_payment_provider TEXT,
  p_platform_fee_rate NUMERIC,
  p_fee_handling TEXT,
  p_status TEXT,
  p_receipt_email TEXT,
  p_receipt_phone TEXT,
  p_notes TEXT,
  p_completed_by UUID,
  p_items JSONB,
  p_inventory_deductions JSONB,
  p_queue_entry_id UUID DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  new_sale_id UUID;
  item JSONB;
  deduction JSONB;
  v_variant_id UUID;
  parent_qty NUMERIC;
BEGIN
  -- Auth check
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Tenant membership check
  IF NOT EXISTS (
    SELECT 1 FROM tenant_members
    WHERE user_id = auth.uid() AND tenant_id = p_tenant_id
  ) THEN
    RAISE EXCEPTION 'Not a member of this tenant';
  END IF;

  -- 1. Insert sale
  INSERT INTO sales (
    tenant_id, event_id, client_id,
    subtotal, discount_amount, tax_amount, tip_amount,
    platform_fee_amount, total,
    payment_method, payment_status, payment_provider,
    platform_fee_rate, fee_handling,
    status, receipt_email, receipt_phone, notes, completed_by
  ) VALUES (
    p_tenant_id, p_event_id, p_client_id,
    p_subtotal, p_discount_amount, p_tax_amount, p_tip_amount,
    p_platform_fee_amount, p_total,
    p_payment_method::payment_method, p_payment_status::payment_status, p_payment_provider,
    p_platform_fee_rate,
    CASE WHEN p_fee_handling IS NOT NULL AND p_fee_handling != '' THEN p_fee_handling::fee_handling ELSE NULL END,
    p_status::sale_status, p_receipt_email, p_receipt_phone, p_notes, p_completed_by
  ) RETURNING id INTO new_sale_id;

  -- 2. Insert sale items (now includes inventory_variant_id)
  FOR item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO sale_items (
      sale_id, tenant_id, inventory_item_id, inventory_variant_id, name,
      quantity, unit_price, discount_type, discount_value,
      line_total, product_type_id, product_type_name,
      inches_used, jump_ring_cost
    ) VALUES (
      new_sale_id, p_tenant_id,
      NULLIF(item->>'inventory_item_id', '')::UUID,
      NULLIF(item->>'inventory_variant_id', '')::UUID,
      item->>'name',
      (item->>'quantity')::NUMERIC,
      (item->>'unit_price')::NUMERIC,
      NULLIF(item->>'discount_type', ''),
      COALESCE((item->>'discount_value')::NUMERIC, 0),
      (item->>'line_total')::NUMERIC,
      NULLIF(item->>'product_type_id', '')::UUID,
      NULLIF(item->>'product_type_name', ''),
      (item->>'inches_used')::NUMERIC,
      (item->>'jump_ring_cost')::NUMERIC
    );
  END LOOP;

  -- 3. Atomic inventory deductions (variant-aware, floors at 0)
  FOR deduction IN SELECT * FROM jsonb_array_elements(p_inventory_deductions)
  LOOP
    v_variant_id := NULLIF(deduction->>'variant_id', '')::UUID;

    IF v_variant_id IS NOT NULL THEN
      -- Deduct from variant
      UPDATE inventory_item_variants
      SET quantity_on_hand = GREATEST(quantity_on_hand - (deduction->>'amount')::NUMERIC, 0),
          updated_at = NOW()
      WHERE id = v_variant_id
        AND inventory_item_id = (deduction->>'item_id')::UUID;

      -- Recalc parent quantity_on_hand = SUM of active variants
      SELECT COALESCE(SUM(quantity_on_hand), 0) INTO parent_qty
      FROM inventory_item_variants
      WHERE inventory_item_id = (deduction->>'item_id')::UUID AND is_active = true;

      UPDATE inventory_items
      SET quantity_on_hand = parent_qty, updated_at = NOW()
      WHERE id = (deduction->>'item_id')::UUID
        AND tenant_id = p_tenant_id;
    ELSE
      -- Original behavior: deduct from parent item directly
      UPDATE inventory_items
      SET quantity_on_hand = GREATEST(quantity_on_hand - (deduction->>'amount')::NUMERIC, 0),
          updated_at = NOW()
      WHERE id = (deduction->>'item_id')::UUID
        AND tenant_id = p_tenant_id;
    END IF;

    -- Optionally log inventory movement (includes variant_id)
    IF (deduction->>'log_movement')::BOOLEAN IS TRUE THEN
      INSERT INTO inventory_movements (
        tenant_id, inventory_item_id, inventory_variant_id, movement_type,
        quantity, reference_id, notes, performed_by
      ) VALUES (
        p_tenant_id,
        (deduction->>'item_id')::UUID,
        v_variant_id,
        'sale'::movement_type,
        -(deduction->>'amount')::NUMERIC,
        new_sale_id,
        deduction->>'notes',
        NULLIF(deduction->>'performed_by', '')::UUID
      );
    END IF;
  END LOOP;

  -- 4. Update queue entry if provided
  IF p_queue_entry_id IS NOT NULL THEN
    UPDATE queue_entries
    SET status = 'served', served_at = NOW(), updated_at = NOW()
    WHERE id = p_queue_entry_id AND tenant_id = p_tenant_id;
  END IF;

  RETURN new_sale_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
