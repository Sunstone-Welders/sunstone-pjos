-- 053_receipt_columns_reapply.sql
-- Re-apply receipt setting columns that may not have been applied to remote DB.
-- Uses IF NOT EXISTS so it's safe to run on DBs that already have these columns.

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS auto_email_receipt BOOLEAN DEFAULT false;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS auto_sms_receipt BOOLEAN DEFAULT false;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS receipt_footer TEXT DEFAULT '';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS receipt_tagline TEXT DEFAULT '';
