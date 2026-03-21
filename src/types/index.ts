// ============================================================================
// Sunstone PJOS — Application Types (Updated for Task 28: Subscription Billing)
// ============================================================================
// These mirror the database schema. Run `npm run db:types` for auto-generated
// Supabase types, but these provide the application-layer contracts.

export type SubscriptionTier = 'starter' | 'pro' | 'business';
export type SubscriptionStatus = 'none' | 'trialing' | 'active' | 'past_due' | 'canceled' | 'unpaid';
export type FeeHandling = 'pass_to_customer' | 'absorb'; // Default: 'absorb' — fee deducted from artist payout
export type TenantRole = 'admin' | 'manager' | 'staff';
export type BusinessType = 'permanent_jewelry' | 'salon_spa' | 'boutique' | 'popup_vendor' | 'other';
export type InventoryType = 'chain' | 'jump_ring' | 'charm' | 'connector' | 'clasp' | 'other';
export type InventoryUnit = 'ft' | 'in' | 'each' | 'pack';
export type MovementType = 'restock' | 'sale' | 'waste' | 'adjustment';
export type PaymentMethod = 'stripe_link' | 'cash' | 'venmo' | 'card_external' | 'gift_card';
export type PaymentStatus = 'pending' | 'completed' | 'failed' | 'refunded';
export type QueueStatus = 'waiting' | 'notified' | 'served' | 'no_show';
export type SaleStatus = 'draft' | 'completed' | 'voided';
export type RefundStatus = 'none' | 'partial' | 'full';
export type PricingMode = 'per_product' | 'per_inch';
export type TenantPricingMode = 'flat' | 'per_product' | 'tier';
export type WarrantyStatus = 'active' | 'claimed' | 'expired' | 'voided';
export type WarrantyScope = 'per_item' | 'per_invoice';
export type WarrantyClaimStatus = 'submitted' | 'in_progress' | 'completed' | 'denied';

// Re-export Permission from the canonical source
export type { Permission, TenantRole as PermissionRole } from '@/lib/permissions';

// ============================================================================
// Tenant
// ============================================================================

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  owner_id: string;
  // Subscription
  subscription_tier: SubscriptionTier;
  subscription_status: SubscriptionStatus;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  trial_ends_at: string | null;
  subscription_period_end: string | null;
  sunny_questions_used: number;
  sunny_questions_reset_at: string | null;
  // Fees
  fee_handling: FeeHandling;
  platform_fee_percent: number;
  // Business info
  business_type: BusinessType | null;
  phone: string | null;
  website: string | null;
  default_tax_rate: number;
  onboarding_completed: boolean;
  onboarding_step: number;
  onboarding_data: Record<string, any>;
  // Payment provider connections
  square_merchant_id: string | null;
  square_access_token: string | null;
  square_refresh_token: string | null;
  square_location_id: string | null;
  stripe_account_id: string | null;
  stripe_onboarding_complete: boolean;
  default_payment_processor: string | null;
  // Branding
  logo_url: string | null;
  brand_color: string;
  theme_id: string;
  // Waiver
  waiver_text: string;
  waiver_required: boolean;
  // Queue
  avg_service_minutes: number;
  // Other
  min_monthly_transactions: number;
  is_suspended: boolean;
  crm_enabled: boolean;
  // Dedicated phone
  dedicated_phone_number: string | null;
  dedicated_phone_sid: string | null;
  crm_activated_at: string | null;
  crm_deactivated_at: string | null;
  crm_trial_start: string | null;
  crm_trial_end: string | null;
  crm_subscription_id: string | null;
  // Auto-reply + Sunny text
  auto_reply_enabled: boolean;
  auto_reply_message: string | null;
  sunny_text_mode: 'off' | 'suggest' | 'auto';
  // Sunny personality (customer-facing SMS tone)
  sunny_tone_preset: string;
  sunny_tone_custom: string | null;
  // Pricing
  pricing_mode: TenantPricingMode;
  // Warranty
  warranty_enabled: boolean;
  warranty_per_item_default: number;
  warranty_per_invoice_default: number;
  warranty_taxable: boolean;
  warranty_coverage_terms: string | null;
  warranty_duration_days: number | null;
  // Receipts
  auto_email_receipt: boolean;
  auto_sms_receipt: boolean;
  receipt_footer: string;
  receipt_tagline: string;
  // Salesforce + Supply Reorder
  sf_account_id: string | null;
  stripe_reorder_customer_id: string | null;
  // Timestamps
  created_at: string;
  updated_at: string;
}

export interface TenantMember {
  id: string;
  tenant_id: string;
  user_id: string;
  role: TenantRole;
  display_name: string | null;
  invited_email: string | null;
  accepted_at: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// Inventory
// ============================================================================

export interface InventoryItem {
  id: string;
  tenant_id: string;
  name: string;
  type: InventoryType;
  material: string | null;
  supplier: string | null;
  supplier_id: string | null;
  sku: string | null;
  unit: InventoryUnit;
  cost_per_unit: number;
  sell_price: number;
  quantity_on_hand: number;
  reorder_threshold: number;
  is_active: boolean;
  notes: string | null;
  // Chain-specific
  pricing_mode: PricingMode | null;
  pricing_tier_id: string | null;
  // Sunstone supply linkage
  sunstone_product_id: string | null;
  sunstone_variant_id: string | null;
  // Variant system
  has_variants: boolean;
  variants?: InventoryItemVariant[];
  created_at: string;
  updated_at: string;
}

export interface InventoryItemVariant {
  id: string;
  tenant_id: string;
  inventory_item_id: string;
  name: string;
  sku: string | null;
  cost_per_unit: number;
  sell_price: number;
  quantity_on_hand: number;
  reorder_threshold: number;
  sort_order: number;
  is_active: boolean;
  sunstone_variant_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReorderHistory {
  id: string;
  tenant_id: string;
  shopify_draft_order_id: string | null;
  shopify_order_id: string | null;
  shopify_order_name: string | null;
  invoice_url: string | null;
  status: 'draft' | 'checkout_sent' | 'completed' | 'cancelled' | 'pending_payment' | 'confirmed' | 'processing' | 'shipped' | 'sf_pending';
  items: {
    inventory_item_id: string | null;
    variant_id: string;
    name: string;
    quantity: number;
    unit_price: number;
  }[];
  total_amount: number;
  notes: string | null;
  ordered_by: string | null;
  received_at: string | null;
  received_by: string | null;
  // Salesforce fields
  sf_opportunity_id: string | null;
  sf_quote_id: string | null;
  sf_quote_number: string | null;
  sf_order_id: string | null;
  tracking_number: string | null;
  shipping_carrier: string | null;
  shipping_status: string | null;
  stripe_payment_intent_id: string | null;
  tax_amount: number;
  shipping_amount: number;
  created_at: string;
  updated_at: string;
}

export interface PricingTier {
  id: string;
  tenant_id: string;
  name: string;
  bracelet_price: number | null;
  anklet_price: number | null;
  ring_price: number | null;
  necklace_price_per_inch: number | null;
  hand_chain_price: number | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface InventoryMovement {
  id: string;
  tenant_id: string;
  inventory_item_id: string;
  movement_type: MovementType;
  quantity: number;
  reference_id: string | null;
  notes: string | null;
  performed_by: string | null;
  created_at: string;
}

// ============================================================================
// Suppliers & Product Types (Chain Products)
// ============================================================================

export interface Supplier {
  id: string;
  tenant_id: string;
  name: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  website: string | null;
  is_sunstone: boolean;
  notes: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface ProductType {
  id: string;
  tenant_id: string;
  name: string;
  default_inches: number;
  jump_rings_required?: number;
  sort_order: number;
  is_active: boolean;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface ChainProductPrice {
  id: string;
  inventory_item_id: string;
  product_type_id: string;
  tenant_id: string;
  sell_price: number;
  default_inches: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  product_type?: ProductType;
}

export interface Material {
  id: string;
  name: string;
  abbreviation: string;
  sort_order: number;
  is_system: boolean;
}

// ============================================================================
// Events & Tax
// ============================================================================

export interface TaxProfile {
  id: string;
  tenant_id: string;
  name: string;
  rate: number;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface Event {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  location: string | null;
  start_time: string;
  end_time: string | null;
  booth_fee: number;
  tax_profile_id: string | null;
  is_active: boolean;
  notes: string | null;
  selected_chain_ids: string[] | null;
  created_at: string;
  updated_at: string;
  // Joined
  tax_profile?: TaxProfile | null;
}

// ============================================================================
// Sales
// ============================================================================

export interface Sale {
  id: string;
  tenant_id: string;
  event_id: string | null;
  client_id: string | null;
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  tip_amount: number;
  platform_fee_amount: number;
  total: number;
  payment_method: PaymentMethod;
  payment_status: PaymentStatus;
  payment_provider: string | null;
  payment_provider_id: string | null;
  platform_fee_rate: number | null;
  fee_handling: FeeHandling | null;
  refund_status: RefundStatus;
  refund_amount: number;
  refunded_at: string | null;
  refunded_by: string | null;
  stripe_checkout_session_id: string | null;
  stripe_payment_intent_id: string | null;
  platform_fee_collected: number;
  warranty_amount: number;
  status: SaleStatus;
  receipt_email: string | null;
  receipt_phone: string | null;
  receipt_sent_at: string | null;
  notes: string | null;
  completed_by: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  items?: SaleItem[];
  client?: Client | null;
}

export interface SaleItem {
  id: string;
  sale_id: string;
  tenant_id: string;
  inventory_item_id: string | null;
  name: string;
  quantity: number;
  unit_price: number;
  discount_type: 'flat' | 'percentage' | null;
  discount_value: number;
  line_total: number;
  warranty_amount: number;
  // Chain product fields
  product_type_id: string | null;
  chain_inches: number | null;
  cost_snapshot: number | null;
  created_at: string;
}

// ============================================================================
// Clients & Waivers
// ============================================================================

export interface Client {
  id: string;
  tenant_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  birthday: string | null;
  last_visit_at: string | null;
  unread_messages: number;
  last_message_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Waiver {
  id: string;
  tenant_id: string;
  client_id: string | null;
  event_id: string | null;
  signer_name: string;
  signer_email: string | null;
  waiver_text: string;
  signature_data: string;
  signed_at: string;
  pdf_path: string | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

// ============================================================================
// Queue
// ============================================================================

export interface QueueEntry {
  id: string;
  tenant_id: string;
  event_id: string;
  client_id: string | null;
  name: string;
  phone: string | null;
  email: string | null;
  position: number;
  status: QueueStatus;
  notified_at: string | null;
  served_at: string | null;
  waiver_id: string | null;
  sms_consent: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// Client Tags & Segments
// ============================================================================

export interface ClientTag {
  id: string;
  tenant_id: string;
  name: string;
  color: string;
  auto_apply: boolean;
  auto_apply_rule: string | null;
  created_at: string;
}

export interface ClientTagAssignment {
  id: string;
  client_id: string;
  tag_id: string;
  assigned_at: string;
}

export interface ClientSegment {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  filter_criteria: Record<string, any>;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// Message Templates
// ============================================================================

export type MessageChannel = 'sms' | 'email';
export type MessageCategory = 'general' | 'aftercare' | 'promotion' | 'reminder' | 'follow_up' | 'thank_you' | 'booking';

export interface MessageTemplate {
  id: string;
  tenant_id: string;
  name: string;
  channel: MessageChannel;
  subject: string | null;
  body: string;
  category: MessageCategory;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// Broadcasts
// ============================================================================

export type BroadcastStatus = 'draft' | 'sending' | 'completed' | 'failed';
export type BroadcastTargetType = 'tag' | 'segment' | 'all';
export type BroadcastMessageStatus = 'pending' | 'sent' | 'failed' | 'skipped';

export interface Broadcast {
  id: string;
  tenant_id: string;
  name: string;
  channel: MessageChannel;
  template_id: string | null;
  custom_subject: string | null;
  custom_body: string | null;
  target_type: BroadcastTargetType;
  target_id: string | null;
  target_name: string | null;
  total_recipients: number;
  sent_count: number;
  failed_count: number;
  skipped_count: number;
  status: BroadcastStatus;
  sent_at: string | null;
  created_at: string;
}

export interface BroadcastMessage {
  id: string;
  broadcast_id: string;
  client_id: string;
  channel: MessageChannel;
  recipient: string;
  rendered_subject: string | null;
  rendered_body: string;
  status: BroadcastMessageStatus;
  error_message: string | null;
  sent_at: string | null;
  created_at: string;
}

// ============================================================================
// Platform Fee Rates
// ============================================================================

export const PLATFORM_FEE_RATES: Record<SubscriptionTier, number> = {
  starter:  0.03,   // 3%
  pro:      0.015,  // 1.5%
  business: 0,      // 0%
};

export const SUBSCRIPTION_PRICES: Record<SubscriptionTier, number> = {
  starter: 99,
  pro: 169,
  business: 279,
};

// ============================================================================
// Dashboard Cards
// ============================================================================

export type DashboardCardType =
  | 'getting_started'
  | 'next_event'
  | 'sunny_take'
  | 'revenue_snapshot'
  | 'suggested_outreach'
  | 'inventory_alert'
  | 'networking_nudge'
  | 'recent_messages'
  | 'pj_university'
  | 'sunstone_product'
  | 'todays_priorities'
  | 'growth_tip';

export interface DashboardCard {
  type: DashboardCardType;
  priority: number;
  // Type-specific payload — each card component reads its own shape
  data: Record<string, unknown>;
}

// ── Per-card data shapes (used by card components) ────────────────────────

export interface NextEventData {
  eventName: string;
  date: string;        // formatted date string
  location: string | null;
  daysUntil: number;
  boothFee: number;
}

export interface RevenueData {
  monthRevenue: number;
  lastMonthRevenue: number;
  pctChange: number | null;
  salesCount: number;
  eventsCount: number;
  dailyBars: number[];  // 12 values, normalized 0-1
}

export interface InventoryAlertData {
  items: {
    name: string;
    stock: number;
    threshold: number;
    status: 'critical' | 'low' | 'ok';
  }[];
}

export interface OutreachData {
  clients: {
    name: string;
    reason: string;
  }[];
}

export interface NudgeData {
  title: string;
  body: string;
  primaryLabel: string;
  primaryRoute: string;
  secondaryLabel?: string;
  secondaryRoute?: string;
}

export interface MessagesData {
  messages: {
    sender: string;
    initials: string;
    text: string;
    time: string;
    isSystem: boolean;
  }[];
}

export interface SunstoneProductData {
  title: string;
  body: string;
  actionLabel: string;
  actionRoute: string;
  imageUrl?: string | null;
  badge?: string;
  price?: string | null;
  salePrice?: string | null;
}

export interface GettingStartedData {
  steps: {
    label: string;
    done: boolean;
    href: string;
  }[];
  completedCount: number;
  totalCount: number;
}

export interface SunnyTakeData {
  insight: string;
  generatedAt: string;
}

export interface TodaysPrioritiesData {
  items: {
    type: string;
    label: string;
    link: string;
    icon: string;
  }[];
}

export interface GrowthTipData {
  stage: 'new' | 'growth' | 'established';
  tip: string;
  metric?: number;
}

export interface PJUniversityData {
  title: string;
  subtitle: string;
  ctaLabel: string;
  ctaUrl: string;
}

// ============================================================================
// POS Cart Types (in-memory, not persisted until sale completes)
// ============================================================================

export interface CartItem {
  id: string; // temp id
  inventory_item_id: string | null;
  inventory_variant_id?: string | null;
  _variant_name?: string | null;
  name: string;
  quantity: number;
  unit_price: number;
  discount_type: 'flat' | 'percentage' | null;
  discount_value: number;
  warranty_amount: number;
  line_total: number;
  // Chain product fields
  product_type_id?: string | null;
  chain_inches?: number | null;
  // Chain product metadata
  product_type_name?: string | null;
  inches_used?: number | null;
  pricing_mode?: 'per_inch' | 'per_piece' | 'per_product' | null;
  _jump_rings_required?: number | null;
  _inventory_type?: string | null;
  _material?: string | null;
}

export interface CartState {
  items: CartItem[];
  subtotal: number;
  discount_amount: number;
  warranty_amount: number;
  tax_rate: number;
  tax_amount: number;
  tip_amount: number;
  platform_fee_amount: number;
  total: number;
  payment_method: PaymentMethod | null;
  client_id: string | null;
  notes: string;
}

// Jump Ring Resolution — used during sale completion
export interface JumpRingResolution {
  cart_item_id: string;
  cart_item_name: string;
  jump_rings_needed: number;
  jump_ring_inventory_id: string | null;
  jump_ring_cost_each: number;
  material_name: string;
  resolved: boolean;
}

// ============================================================================
// Tutorial Progress
// ============================================================================

export type TutorialPageKey =
  | 'events'
  | 'inventory'
  | 'pos'
  | 'clients'
  | 'settings'
  | 'reports';

export interface TutorialProgress {
  id: string;
  user_id: string;
  tenant_id: string;
  page_key: TutorialPageKey;
  completed: boolean;
  completed_at: string | null;
  created_at: string;
}

// ============================================================================
// Refunds
// ============================================================================

export interface Refund {
  id: string;
  tenant_id: string;
  sale_id: string;
  amount: number;
  reason: string | null;
  payment_method: string | null;
  stripe_refund_id: string | null;
  square_refund_id: string | null;
  created_at: string;
  created_by: string | null;
}

// ============================================================================
// Expenses
// ============================================================================

export interface Expense {
  id: string;
  tenant_id: string;
  name: string;
  amount: number;
  category: string;
  date: string;
  event_id: string | null;
  notes: string | null;
  is_recurring: boolean;
  recurring_frequency: string | null;
  created_by: string | null;
  created_at: string;
  // Joined
  event?: { name: string } | null;
}

export const EXPENSE_CATEGORIES = [
  'Booth Fee',
  'Supplies',
  'Chain Restock',
  'Travel & Gas',
  'Marketing & Advertising',
  'Equipment',
  'Insurance',
  'Software & Subscriptions',
  'Education & Training',
  'Packaging & Display',
  'Other',
] as const;

export type ExpenseCategory = typeof EXPENSE_CATEGORIES[number];

// Jump Ring Confirmation — used in post-sale confirmation UI
export interface JumpRingConfirmation {
  cart_item_id: string;
  cart_item_name: string;
  item_name: string;
  jump_ring_name: string;
  jump_ring_inventory_id: string | null;
  material_name: string;
  jump_rings_used: number;
  jump_ring_cost: number;
  auto_deducted: boolean;
  default_count: number;
  actual_count: number;
}

// ============================================================================
// Gift Cards
// ============================================================================

export type GiftCardStatus = 'active' | 'fully_redeemed' | 'expired' | 'cancelled';
export type GiftCardDeliveryMethod = 'sms' | 'email' | 'print' | 'none';

export interface GiftCard {
  id: string;
  tenant_id: string;
  code: string;
  amount: number;
  remaining_balance: number;
  status: GiftCardStatus;
  purchaser_name: string | null;
  purchaser_email: string | null;
  purchaser_phone: string | null;
  recipient_name: string;
  recipient_email: string | null;
  recipient_phone: string | null;
  personal_message: string | null;
  delivery_method: GiftCardDeliveryMethod;
  delivered_at: string | null;
  payment_method: string | null;
  sale_id: string | null;
  purchased_at: string;
  expires_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  redemptions?: GiftCardRedemption[];
  redemption_count?: number;
  total_redeemed?: number;
}

export interface GiftCardRedemption {
  id: string;
  gift_card_id: string;
  sale_id: string;
  tenant_id: string;
  amount: number;
  redeemed_at: string;
  redeemed_by: string | null;
  created_at: string;
}

// ============================================================================
// Conversations (Two-Way SMS)
// ============================================================================

export interface ConversationMessage {
  id: string;
  tenant_id: string;
  client_id: string | null;
  phone_number: string;
  direction: 'inbound' | 'outbound';
  body: string;
  twilio_sid: string | null;
  status: 'delivered' | 'failed' | 'pending';
  read: boolean;
  ai_suggested_response: string | null;
  created_at: string;
}

// ============================================================================
// Client Phone Numbers
// ============================================================================

export interface ClientPhoneNumber {
  id: string;
  tenant_id: string;
  client_id: string;
  phone: string;
  phone_normalized: string;
  label: string;
  is_primary: boolean;
  created_at: string;
}

// ============================================================================
// Cash Drawers
// ============================================================================

export type CashDrawerStatus = 'open' | 'closed';
export type CashDrawerTransactionType = 'sale' | 'tip' | 'pay_in' | 'pay_out' | 'adjustment';

export interface CashDrawer {
  id: string;
  tenant_id: string;
  event_id: string | null;
  opened_at: string;
  closed_at: string | null;
  opening_amount: number;
  closing_amount: number | null;
  expected_amount: number | null;
  difference: number | null;
  notes: string | null;
  status: CashDrawerStatus;
  opened_by: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  transactions?: CashDrawerTransaction[];
}

export interface CashDrawerTransaction {
  id: string;
  session_id: string;
  tenant_id: string;
  sale_id: string | null;
  type: CashDrawerTransactionType;
  amount: number;
  description: string | null;
  created_at: string;
}

// ============================================================================
// Warranties
// ============================================================================

export interface Warranty {
  id: string;
  tenant_id: string;
  sale_id: string;
  sale_item_id: string | null;
  client_id: string | null;
  scope: WarrantyScope;
  amount: number;
  coverage_terms: string | null;
  status: WarrantyStatus;
  purchased_at: string;
  expires_at: string | null;
  photo_url: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface WarrantyClaim {
  id: string;
  warranty_id: string;
  tenant_id: string;
  claim_date: string;
  description: string;
  repair_details: string | null;
  status: WarrantyClaimStatus;
  resolved_at: string | null;
  resolved_by: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// Public Profile & Party Booking
// ============================================================================

export interface ProfileSettings {
  enabled: boolean;
  show_pricing: boolean;
  show_events: boolean;
  show_party_booking: boolean;
  show_contact: boolean;
  show_tier_pricing?: boolean;
}

export type PartyRequestStatus = 'new' | 'contacted' | 'confirmed' | 'completed' | 'cancelled';

export type DepositStatus = 'none' | 'pending' | 'paid' | 'waived';

export interface PartyRewardSettings {
  enabled: boolean;
  reward_percent: number; // e.g. 10 = host gets 10% of party revenue as store credit
  minimum_spend: number;  // minimum party revenue before reward kicks in
}

export interface PartyRequest {
  id: string;
  tenant_id: string;
  client_id: string | null;
  status: PartyRequestStatus;
  host_name: string;
  host_email: string | null;
  host_phone: string;
  preferred_date: string | null;
  preferred_time: string | null;
  location: string | null;
  estimated_guests: number | null;
  occasion: string | null;
  message: string | null;
  notes: string | null;
  event_id: string | null;
  // Deposit
  deposit_amount: number;
  deposit_status: DepositStatus;
  deposit_paid_at: string | null;
  stripe_checkout_session_id: string | null;
  stripe_payment_intent_id: string | null;
  // Revenue & Guarantee
  minimum_guarantee: number;
  total_revenue: number;
  total_sales: number;
  // Host Rewards
  host_reward_amount: number;
  host_reward_redeemed: boolean;
  host_reward_redeemed_at: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  rsvp_count?: number;
  attending_count?: number;
}

export type PartyMessageStatus = 'pending' | 'sent' | 'cancelled' | 'failed' | 'skipped';

export interface PartyScheduledMessage {
  id: string;
  tenant_id: string;
  party_request_id: string;
  template_name: string;
  recipient_phone: string;
  recipient_name: string | null;
  message_body: string;
  scheduled_for: string;
  sent_at: string | null;
  party_rsvp_id: string | null;
  skip_reason: string | null;
  status: PartyMessageStatus;
  created_at: string;
}

export interface PartyRsvp {
  id: string;
  party_request_id: string;
  tenant_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  attending: boolean;
  plus_ones: number;
  waiver_signed: boolean;
  waiver_id: string | null;
  client_id: string | null;
  created_at: string;
}