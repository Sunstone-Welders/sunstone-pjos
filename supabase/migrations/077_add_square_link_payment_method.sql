-- ============================================================================
-- Migration 077: Add 'square_link' to payment_method enum
-- ============================================================================
-- The payment_method enum was missing 'square_link', causing the
-- create_sale_transaction RPC to fail with an invalid enum cast when
-- a tenant uses Square as their payment processor.
-- ============================================================================

ALTER TYPE payment_method ADD VALUE IF NOT EXISTS 'square_link';
