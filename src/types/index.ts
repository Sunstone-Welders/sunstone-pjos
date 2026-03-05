// ============================================================================
// Sunstone PJOS — Application Types (Updated for Task 28: Subscription Billing)
// ============================================================================
// These mirror the database schema. Run `npm run db:types` for auto-generated
// Supabase types, but these provide the application-layer contracts.

export type SubscriptionTier = 'starter' | 'pro' | 'business';
export type SubscriptionStatus = 'none' | 'trialing' | 'active' | 'past_due' | 'canceled' | 'unpaid';
export type FeeHandling = 'pass_to_customer' | 'absorb';
export type TenantRole = 'admin' | 'manager' | 'staff';
export type BusinessType = 'permanent_jewelry' | 'salon_spa' | 'boutique' | 'popup_vendor' | 'other';
export type InventoryType = 'chain' | 'jump_ring' | 'charm' | 'connector' | 'other';
export type InventoryUnit = 'ft' | 'in' | 'each' | 'pack';
export type MovementType = 'restock' | 'sale' | 'waste' | 'adjustment';
export type PaymentMethod = 'stripe_link' | 'cash' | 'venmo' | 'card_external' | 'gift_card';
export type PaymentStatus = 'pending' | 'completed' | 'failed' | 'refunded';
export type QueueStatus = 'waiting' | 'notified' | 'served' | 'no_show';
export type SaleStatus = 'draft' | 'completed' | 'voided';
export type RefundStatus = 'none' | 'partial' | 'full';
export type PricingMode = 'per_product' | 'per_inch';

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
  // Receipts
  auto_email_receipt: boolean;
  auto_sms_receipt: boolean;
  receipt_footer: string;
  receipt_tagline: string;
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
  | 'sunstone_product';

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
  name: string;
  quantity: number;
  unit_price: number;
  discount_type: 'flat' | 'percentage' | null;
  discount_value: number;
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