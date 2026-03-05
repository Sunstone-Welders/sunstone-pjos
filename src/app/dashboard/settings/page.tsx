// ============================================================================
// Settings Page — Phase D6 Accordion Redesign
// ============================================================================
// Single-page accordion with 6 collapsible sections:
//   1. My Business — name, type, phone, website, logo, theme
//   2. Payments — Square/Stripe connections, fee handling
//   3. Plan & Billing — current plan, trial, upgrade, comparison
//   4. Tax — tax profile CRUD
//   5. Waiver — waiver text editor with confirmation
//   6. Team — members, invites, roles
// ============================================================================

'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useTenant } from '@/hooks/use-tenant';
import { toast } from 'sonner';
import { ROLE_CONFIG, type TenantRole } from '@/lib/permissions';
import {
  Button,
  Input,
  Select,
  Textarea,
  Badge,
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
} from '@/components/ui';
import { applyTheme } from '@/lib/theme';
import { THEMES, LIGHT_THEMES, DARK_THEMES, getThemeById, DEFAULT_THEME_ID, type ThemeDefinition } from '@/lib/themes';
import type { TaxProfile, BusinessType, SubscriptionTier } from '@/types';
import { PLATFORM_FEE_RATES, SUBSCRIPTION_PRICES } from '@/types';
import { getSubscriptionTier } from '@/lib/subscription';
import SunnyTutorial from '@/components/SunnyTutorial';

// ============================================================================
// Constants
// ============================================================================

const BUSINESS_TYPE_OPTIONS = [
  { value: '', label: 'Not set' },
  { value: 'permanent_jewelry', label: 'Permanent Jewelry' },
  { value: 'salon_spa', label: 'Salon / Spa' },
  { value: 'boutique', label: 'Boutique' },
  { value: 'popup_vendor', label: 'Pop-up Vendor' },
  { value: 'other', label: 'Other' },
];

const TEAM_MEMBER_LIMITS: Record<string, number> = {
  starter: 1,
  pro: 3,
  business: Infinity,
};

const ROLE_OPTIONS = [
  { value: 'staff', label: 'Staff' },
  { value: 'manager', label: 'Manager' },
];

const ALL_ROLE_OPTIONS = [
  { value: 'staff', label: 'Staff' },
  { value: 'manager', label: 'Manager' },
  { value: 'admin', label: 'Admin' },
];

const PLAN_FEATURES: Record<string, string[]> = {
  pro: [
    '1.5% processing fee (customer pays)',
    'Unlimited Sunny AI questions',
    'Business insights & analytics',
    'Full P&L reports',
    'Up to 3 team members',
  ],
  business: [
    '0% processing fee',
    'Everything in Pro',
    'Unlimited team members',
    'Priority support',
  ],
};

// ============================================================================
// Types
// ============================================================================

interface TeamMember {
  id: string;
  tenant_id: string;
  user_id: string;
  role: TenantRole;
  display_name: string | null;
  invited_email: string | null;
  accepted_at: string | null;
  created_at: string;
  updated_at: string;
  is_owner: boolean;
  is_pending: boolean;
}

type PaymentProcessor = 'square' | 'stripe';
type SectionId = 'business' | 'payments' | 'billing' | 'tax' | 'waiver' | 'team';

// ============================================================================
// Subscription Helpers
// ============================================================================

function getTrialDaysRemaining(trialEndsAt: string | null): number {
  if (!trialEndsAt) return 0;
  const now = new Date();
  const end = new Date(trialEndsAt);
  const diff = end.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

function isTrialActive(status: string | null, trialEndsAt: string | null): boolean {
  if (status !== 'trialing') return false;
  if (!trialEndsAt) return false;
  return new Date(trialEndsAt) > new Date();
}

// ============================================================================
// Accordion Section Component
// ============================================================================

function AccordionSection({
  icon,
  title,
  summary,
  isOpen,
  onToggle,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  summary: string;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-[var(--border-default)] rounded-2xl overflow-hidden bg-[var(--surface-raised)]">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-5 py-4 min-h-[56px] text-left transition-colors hover:bg-[var(--surface-subtle)]"
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="w-8 h-8 rounded-lg bg-[var(--surface-subtle)] flex items-center justify-center shrink-0 text-[var(--text-secondary)]">
            {icon}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">{title}</h3>
            {!isOpen && summary && (
              <p className="text-xs text-[var(--text-tertiary)] truncate mt-0.5">{summary}</p>
            )}
          </div>
        </div>
        <svg
          className={`w-5 h-5 text-[var(--text-tertiary)] shrink-0 ml-3 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>
      {isOpen && (
        <div className="px-5 pb-5 border-t border-[var(--border-subtle)]">
          {children}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Section Icons
// ============================================================================

const IconBusiness = (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 21v-7.5a.75.75 0 01.75-.75h3a.75.75 0 01.75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349m-16.5 11.65V9.35m0 0a3.001 3.001 0 003.75-.615A2.993 2.993 0 009.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 002.25 1.016c.896 0 1.7-.393 2.25-1.016a3.001 3.001 0 003.75.614m-16.5 0a3.004 3.004 0 01-.621-4.72L4.318 3.44A1.5 1.5 0 015.378 3h13.243a1.5 1.5 0 011.06.44l1.19 1.189a3 3 0 01-.621 4.72" />
  </svg>
);

const IconPayments = (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
  </svg>
);

const IconBilling = (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
  </svg>
);

const IconTax = (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 15.75V18m-7.5-6.75h.008v.008H8.25v-.008zm0 2.25h.008v.008H8.25V13.5zm0 2.25h.008v.008H8.25v-.008zm0 2.25h.008v.008H8.25V18zm2.498-6.75h.007v.008h-.007v-.008zm0 2.25h.007v.008h-.007V13.5zm0 2.25h.007v.008h-.007v-.008zm0 2.25h.007v.008h-.007V18zm2.504-6.75h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V13.5zm0 2.25h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V18zm2.498-6.75h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V13.5zM8.25 6h7.5v2.25h-7.5V6zM12 2.25c-1.892 0-3.758.11-5.593.322C5.307 2.7 4.5 3.65 4.5 4.757V19.5a2.25 2.25 0 002.25 2.25h10.5a2.25 2.25 0 002.25-2.25V4.757c0-1.108-.806-2.057-1.907-2.185A48.507 48.507 0 0012 2.25z" />
  </svg>
);

const IconWaiver = (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
  </svg>
);

const IconTeam = (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
  </svg>
);

// ============================================================================
// Theme Preview Card
// ============================================================================

function ThemePreviewCard({
  theme,
  isSelected,
  onSelect,
}: {
  theme: ThemeDefinition;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={`relative rounded-xl border-2 overflow-hidden transition-all duration-200 hover:scale-[1.03] text-left ${
        isSelected
          ? 'border-[var(--accent-primary)] shadow-md ring-2 ring-[var(--accent-subtle)]'
          : 'border-transparent hover:border-[var(--border-strong)]'
      }`}
    >
      <div
        className="p-3 space-y-2"
        style={{ backgroundColor: theme.background }}
      >
        <div
          className="text-xs font-semibold truncate"
          style={{ color: theme.textPrimary, fontFamily: `'${theme.headingFont}', serif` }}
        >
          {theme.name}
        </div>
        <div
          className="text-[9px] truncate"
          style={{ color: theme.textSecondary }}
        >
          {theme.description}
        </div>
        <div
          className="p-2 space-y-1.5"
          style={{
            backgroundColor: theme.surfaceRaised,
            border: `1px solid ${theme.borderDefault}`,
            borderRadius: theme.cardRadius,
          }}
        >
          <div
            className="h-1.5 rounded-full w-3/4"
            style={{ backgroundColor: theme.textSecondary, opacity: 0.4 }}
          />
          <div
            className="h-1.5 rounded-full w-1/2"
            style={{ backgroundColor: theme.textTertiary, opacity: 0.3 }}
          />
        </div>
        <div
          className="h-5 flex items-center justify-center"
          style={{ backgroundColor: theme.accent, borderRadius: theme.cardRadius }}
        >
          <span
            className="text-[8px] font-semibold"
            style={{ color: theme.textOnAccent }}
          >
            Button
          </span>
        </div>
      </div>
      {isSelected && (
        <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-[var(--accent-primary)] flex items-center justify-center">
          <svg className="w-3 h-3 text-[var(--text-on-accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        </div>
      )}
    </button>
  );
}

// ============================================================================
// Page Component
// ============================================================================

function SettingsPage() {
  const { tenant, can, isOwner, refetch } = useTenant();
  const searchParams = useSearchParams();
  const router = useRouter();
  const supabase = createClient();

  // Redirect non-admins
  useEffect(() => {
    if (!can('settings:manage') && !can('team:manage')) {
      router.push('/dashboard');
    }
  }, [can, router]);

  // ── Accordion state ──
  const [openSection, setOpenSection] = useState<SectionId | null>(null);
  const toggleSection = (id: SectionId) => {
    setOpenSection((prev) => (prev === id ? null : id));
  };

  // ── Business info ──
  const [businessName, setBusinessName] = useState('');
  const [businessType, setBusinessType] = useState('');
  const [businessPhone, setBusinessPhone] = useState('');
  const [businessWebsite, setBusinessWebsite] = useState('');
  const [savingBusiness, setSavingBusiness] = useState(false);

  // ── Theme ──
  const [selectedThemeId, setSelectedThemeId] = useState(DEFAULT_THEME_ID);
  const [savingBrand, setSavingBrand] = useState(false);

  // ── Logo upload ──
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  // ── Tax profiles ──
  const [taxProfiles, setTaxProfiles] = useState<TaxProfile[]>([]);
  const [newTax, setNewTax] = useState({ name: '', rate: '' });

  // ── Waiver ──
  const [waiverText, setWaiverText] = useState('');
  const [showWaiverConfirm, setShowWaiverConfirm] = useState(false);

  // ── Receipts ──
  const [autoEmailReceipt, setAutoEmailReceipt] = useState(false);
  const [autoSmsReceipt, setAutoSmsReceipt] = useState(false);
  const [receiptFooter, setReceiptFooter] = useState('');
  const [receiptTagline, setReceiptTagline] = useState('');
  const [savingReceipts, setSavingReceipts] = useState(false);

  // ── Payment ──
  const [disconnectingSquare, setDisconnectingSquare] = useState(false);
  const [disconnectingStripe, setDisconnectingStripe] = useState(false);
  const [defaultProcessor, setDefaultProcessor] = useState<string | null>(null);
  const [savingProcessor, setSavingProcessor] = useState(false);

  // ── Team state ──
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [teamLoading, setTeamLoading] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<TenantRole>('staff');
  const [inviteName, setInviteName] = useState('');
  const [inviting, setInviting] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<TeamMember | null>(null);
  const [removing, setRemoving] = useState(false);

  // ── Subscription state ──
  const [subscribing, setSubscribing] = useState(false);

  // ============================================================================
  // OAuth redirect handling
  // ============================================================================

  useEffect(() => {
    const squareSuccess = searchParams.get('success');
    const squareError = searchParams.get('error');
    const stripeParam = searchParams.get('stripe');
    const checkoutParam = searchParams.get('checkout');
    const tabParam = searchParams.get('tab');

    if (squareSuccess === 'square_connected') {
      toast.success('Square connected successfully!');
      setOpenSection('payments');
    }
    if (squareError === 'square_denied') {
      toast.error('Square authorization was denied.');
      setOpenSection('payments');
    } else if (squareError) {
      toast.error('Failed to connect Square. Please try again.');
      setOpenSection('payments');
    }

    if (stripeParam === 'connected') {
      toast.success('Stripe connected successfully!');
      setOpenSection('payments');
    } else if (stripeParam === 'error') {
      toast.error('Failed to connect Stripe. Please try again.');
      setOpenSection('payments');
    }

    if (checkoutParam === 'success') {
      toast.success('Subscription activated! Welcome aboard.');
      setOpenSection('billing');
      refetch();
    } else if (checkoutParam === 'canceled') {
      toast.info('Subscription checkout was canceled.');
      setOpenSection('billing');
    }

    // Map old tab params to accordion sections
    if (tabParam === 'subscription') {
      setOpenSection('billing');
    } else if (tabParam === 'team') {
      setOpenSection('team');
    }

    // Clean up URL params
    if (squareSuccess || squareError || stripeParam || checkoutParam || tabParam) {
      const url = new URL(window.location.href);
      url.searchParams.delete('success');
      url.searchParams.delete('error');
      url.searchParams.delete('stripe');
      url.searchParams.delete('checkout');
      url.searchParams.delete('tab');
      window.history.replaceState({}, '', url.pathname);
    }
  }, [searchParams]);

  // Refetch tenant when returning from OAuth
  useEffect(() => {
    const stripeParam = searchParams.get('stripe');
    const squareSuccess = searchParams.get('success');
    if (stripeParam === 'connected' || squareSuccess === 'square_connected') {
      refetch();
    }
  }, [searchParams]);

  // ============================================================================
  // Load tenant data
  // ============================================================================

  useEffect(() => {
    if (!tenant) return;
    setBusinessName(tenant.name || '');
    setBusinessType((tenant as any).business_type || '');
    setBusinessPhone((tenant as any).phone || '');
    setBusinessWebsite((tenant as any).website || '');
    setWaiverText(tenant.waiver_text);
    setAutoEmailReceipt(tenant.auto_email_receipt ?? false);
    setAutoSmsReceipt(tenant.auto_sms_receipt ?? false);
    setReceiptFooter(tenant.receipt_footer ?? '');
    setReceiptTagline(tenant.receipt_tagline ?? '');
    setLogoUrl((tenant as any).logo_url || null);
    if (tenant.theme_id) {
      setSelectedThemeId(tenant.theme_id);
    }

    // Load default payment processor
    setDefaultProcessor((tenant as any).default_payment_processor || null);

    supabase
      .from('tax_profiles')
      .select('*')
      .eq('tenant_id', tenant.id)
      .order('name')
      .then(({ data }) => setTaxProfiles((data || []) as TaxProfile[]));
  }, [tenant]);

  // ============================================================================
  // Team functions
  // ============================================================================

  const fetchTeam = useCallback(async () => {
    setTeamLoading(true);
    try {
      const res = await fetch('/api/team');
      if (!res.ok) throw new Error('Failed to fetch team');
      const data = await res.json();
      setTeamMembers(data.members || []);
    } catch (err) {
      console.error('Fetch team error:', err);
      toast.error('Failed to load team members');
    } finally {
      setTeamLoading(false);
    }
  }, []);

  // Fetch team when team section opens
  useEffect(() => {
    if (openSection === 'team' && can('team:manage')) {
      fetchTeam();
    }
  }, [openSection, can, fetchTeam]);

  const handleInvite = async () => {
    if (!inviteEmail.trim()) {
      toast.error('Email is required');
      return;
    }
    setInviting(true);
    try {
      const res = await fetch('/api/team/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: inviteEmail.trim(),
          role: inviteRole,
          display_name: inviteName.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Failed to send invite');
        return;
      }
      toast.success(data.message || 'Invite sent!');
      setShowInviteModal(false);
      setInviteEmail('');
      setInviteName('');
      setInviteRole('staff');
      fetchTeam();
    } catch {
      toast.error('Failed to send invite');
    } finally {
      setInviting(false);
    }
  };

  const handleChangeRole = async (member: TeamMember, newRole: TenantRole) => {
    try {
      const res = await fetch(`/api/team/${member.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Failed to update role');
        return;
      }
      toast.success(`Role updated to ${ROLE_CONFIG[newRole].label}`);
      fetchTeam();
    } catch {
      toast.error('Failed to update role');
    }
  };

  const handleRemoveMember = async () => {
    if (!confirmRemove) return;
    setRemoving(true);
    try {
      const res = await fetch(`/api/team?id=${confirmRemove.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Failed to remove member');
        return;
      }
      toast.success('Team member removed');
      setConfirmRemove(null);
      fetchTeam();
    } catch {
      toast.error('Failed to remove member');
    } finally {
      setRemoving(false);
    }
  };

  const handleResendInvite = async (member: TeamMember) => {
    if (!member.invited_email) return;
    try {
      const res = await fetch('/api/team/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: member.invited_email,
          role: member.role,
          display_name: member.display_name || undefined,
        }),
      });
      if (!res.ok) {
        toast.success('Invite resent');
        return;
      }
      toast.success('Invite resent');
    } catch {
      toast.error('Failed to resend invite');
    }
  };

  // ============================================================================
  // General settings save handlers
  // ============================================================================

  const saveBusinessInfo = async () => {
    if (!tenant) return;
    setSavingBusiness(true);
    const { error } = await supabase
      .from('tenants')
      .update({
        name: businessName.trim(),
        business_type: businessType || null,
        phone: businessPhone.trim() || null,
        website: businessWebsite.trim() || null,
      })
      .eq('id', tenant.id);
    setSavingBusiness(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Business info updated');
    refetch();
  };

  const saveBranding = async () => {
    if (!tenant) return;
    setSavingBrand(true);
    const { error } = await supabase
      .from('tenants')
      .update({ theme_id: selectedThemeId })
      .eq('id', tenant.id);
    setSavingBrand(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Theme saved');
    refetch();
  };

  const selectTheme = (themeId: string) => {
    setSelectedThemeId(themeId);
    const theme = getThemeById(themeId);
    applyTheme(theme);
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !tenant) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Image must be under 2MB');
      return;
    }

    setUploadingLogo(true);
    try {
      const ext = file.name.split('.').pop() || 'png';
      const filePath = `${tenant.id}/logo.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('tenant-assets')
        .upload(filePath, file, { upsert: true, cacheControl: '3600' });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('tenant-assets')
        .getPublicUrl(filePath);

      const url = `${publicUrl}?t=${Date.now()}`;

      const { error: updateError } = await supabase
        .from('tenants')
        .update({ logo_url: url })
        .eq('id', tenant.id);

      if (updateError) throw updateError;

      setLogoUrl(url);
      toast.success('Logo uploaded');
      refetch();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to upload logo');
    } finally {
      setUploadingLogo(false);
    }
  };

  const removeLogo = async () => {
    if (!tenant) return;
    setUploadingLogo(true);
    try {
      const { error } = await supabase
        .from('tenants')
        .update({ logo_url: null })
        .eq('id', tenant.id);
      if (error) throw error;
      setLogoUrl(null);
      toast.success('Logo removed');
      refetch();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to remove logo');
    } finally {
      setUploadingLogo(false);
    }
  };

  const saveDefaultProcessor = async (processor: string) => {
    if (!tenant) return;
    setSavingProcessor(true);
    setDefaultProcessor(processor);
    const { error } = await supabase
      .from('tenants')
      .update({ default_payment_processor: processor })
      .eq('id', tenant.id);
    setSavingProcessor(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`Default processor set to ${processor === 'stripe' ? 'Stripe' : 'Square'}`);
    refetch();
  };

  const saveWaiverText = async () => {
    if (!tenant) return;
    const { error } = await supabase
      .from('tenants')
      .update({ waiver_text: waiverText })
      .eq('id', tenant.id);
    if (error) { toast.error(error.message); return; }
    setShowWaiverConfirm(false);
    toast.success('Waiver text updated');
  };

  const addTaxProfile = async () => {
    if (!tenant || !newTax.name || !newTax.rate) return;
    const { error } = await supabase.from('tax_profiles').insert({
      tenant_id: tenant.id,
      name: newTax.name,
      rate: Number(newTax.rate) / 100,
    });
    if (error) { toast.error(error.message); return; }
    toast.success('Tax profile added');
    setNewTax({ name: '', rate: '' });
    const { data } = await supabase
      .from('tax_profiles')
      .select('*')
      .eq('tenant_id', tenant.id)
      .order('name');
    setTaxProfiles((data || []) as TaxProfile[]);
  };

  const deleteTaxProfile = async (id: string) => {
    const { error } = await supabase.from('tax_profiles').delete().eq('id', id);
    if (error) { toast.error(error.message); return; }
    setTaxProfiles((tp) => tp.filter((t) => t.id !== id));
    toast.success('Tax profile removed');
  };

  const saveReceiptSettings = async () => {
    if (!tenant) return;
    setSavingReceipts(true);
    try {
      const { error } = await supabase.from('tenants').update({
        auto_email_receipt: autoEmailReceipt,
        auto_sms_receipt: autoSmsReceipt,
        receipt_footer: receiptFooter,
        receipt_tagline: receiptTagline,
      }).eq('id', tenant.id);
      if (error) throw error;
      toast.success('Receipt settings saved');
      refetch();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save receipt settings');
    } finally {
      setSavingReceipts(false);
    }
  };

  const disconnectSquare = async () => {
    setDisconnectingSquare(true);
    try {
      const res = await fetch('/api/square/disconnect', { method: 'POST' });
      if (!res.ok) throw new Error('Failed to disconnect');
      toast.success('Square disconnected');
      refetch();
    } catch {
      toast.error('Failed to disconnect Square');
    } finally {
      setDisconnectingSquare(false);
    }
  };

  const disconnectStripe = async () => {
    setDisconnectingStripe(true);
    try {
      const res = await fetch('/api/stripe/disconnect', { method: 'POST' });
      if (!res.ok) throw new Error('Failed to disconnect');
      toast.success('Stripe disconnected');
      refetch();
    } catch {
      toast.error('Failed to disconnect Stripe');
    } finally {
      setDisconnectingStripe(false);
    }
  };

  // ============================================================================
  // Subscription handlers
  // ============================================================================

  const handleSubscribe = async (planTier: 'pro' | 'business') => {
    setSubscribing(true);
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier: planTier }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Failed to start checkout');
        return;
      }
      if (data.url) {
        window.location.href = data.url;
      }
    } catch {
      toast.error('Failed to start checkout. Please try again.');
    } finally {
      setSubscribing(false);
    }
  };

  const handleManageSubscription = async () => {
    try {
      const res = await fetch('/api/stripe/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Failed to open billing portal');
        return;
      }
      if (data.url) {
        window.location.href = data.url;
      }
    } catch {
      toast.error('Failed to open billing portal. Please try again.');
    }
  };

  // ============================================================================
  // Render
  // ============================================================================

  if (!tenant)
    return (
      <div className="text-text-tertiary py-12 text-center">Loading…</div>
    );

  // Derived state
  const tier = tenant.subscription_tier;
  const feeRate = PLATFORM_FEE_RATES[tier];
  const squareConnected = !!(tenant as any).square_merchant_id;
  const stripeConnected = !!tenant.stripe_account_id;
  const showTeamSection = can('team:manage');

  const trialActive = isTrialActive(tenant.subscription_status, tenant.trial_ends_at);
  const trialDays = getTrialDaysRemaining(tenant.trial_ends_at);
  const hasActiveSubscription = tenant.subscription_status === 'active';
  const isPastDue = tenant.subscription_status === 'past_due';
  const effectiveTier = trialActive ? tier : (hasActiveSubscription ? tier : 'starter');

  const activeMembers = teamMembers.filter((m) => !m.is_pending);
  const pendingMembers = teamMembers.filter((m) => m.is_pending);

  // ── Summary lines ──
  const businessTypeLabel = BUSINESS_TYPE_OPTIONS.find((o) => o.value === businessType)?.label;
  const businessSummary = businessName
    ? `${businessName}${businessTypeLabel && businessType ? ` · ${businessTypeLabel}` : ''}`
    : 'Set up your business info';

  const paymentSummary = stripeConnected
        ? 'Stripe connected'
        : 'Connect a payment processor';

  const billingSummary = isPastDue
    ? 'Payment failed — update payment method'
    : trialActive
      ? `Pro Trial · ${trialDays} day${trialDays !== 1 ? 's' : ''} left`
      : hasActiveSubscription
        ? `${tier.charAt(0).toUpperCase() + tier.slice(1)} Plan · $${SUBSCRIPTION_PRICES[tier]}/mo`
        : `Starter · $${SUBSCRIPTION_PRICES.starter}/mo`;

  const receiptAutoStatus = [
    autoEmailReceipt && 'Email',
    autoSmsReceipt && 'SMS',
  ].filter(Boolean);
  const taxSummary = [
    taxProfiles.length > 0
      ? `${taxProfiles.length} tax profile${taxProfiles.length !== 1 ? 's' : ''}`
      : 'No tax profiles',
    receiptAutoStatus.length > 0
      ? `Auto-send: ${receiptAutoStatus.join(' & ')}`
      : null,
  ].filter(Boolean).join(' · ');

  const waiverSummary = waiverText
    ? waiverText.slice(0, 60) + (waiverText.length > 60 ? '…' : '')
    : 'Default waiver text';

  const totalTeamMembers = activeMembers.length + pendingMembers.length;
  const teamSummary = totalTeamMembers > 0
    ? `${activeMembers.length} member${activeMembers.length !== 1 ? 's' : ''}${pendingMembers.length > 0 ? ` · ${pendingMembers.length} pending` : ''}`
    : 'Manage your team';

  return (
    <div className="max-w-2xl mx-auto p-4 sm:p-6 space-y-3 pb-24">
      {/* Page header */}
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-[var(--text-primary)]" style={{ fontFamily: 'var(--font-display)' }}>
          Settings
        </h1>
      </div>

      {/* ================================================================ */}
      {/* Section 1: My Business                                          */}
      {/* ================================================================ */}
      <AccordionSection
        icon={IconBusiness}
        title="My Business"
        summary={businessSummary}
        isOpen={openSection === 'business'}
        onToggle={() => toggleSection('business')}
      >
        <div className="space-y-6 pt-4">
          {/* Business info fields */}
          <div className="space-y-4">
            <Input
              label="Business Name"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              placeholder="My Jewelry Studio"
            />
            <Select
              label="Business Type"
              value={businessType}
              onChange={(e) => setBusinessType(e.target.value)}
              options={BUSINESS_TYPE_OPTIONS}
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Phone"
                type="tel"
                value={businessPhone}
                onChange={(e) => setBusinessPhone(e.target.value)}
                placeholder="(555) 123-4567"
              />
              <Input
                label="Website"
                type="url"
                value={businessWebsite}
                onChange={(e) => setBusinessWebsite(e.target.value)}
                placeholder="https://myshop.com"
              />
            </div>
            <div className="flex justify-end">
              <Button variant="primary" onClick={saveBusinessInfo} loading={savingBusiness}>
                Save Business Info
              </Button>
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-[var(--border-subtle)]" />

          {/* Dedicated Text Number */}
          <DedicatedPhoneSection tenant={tenant} onProvisioned={refetch} />

          {/* Call Handling */}
          <CallHandlingSection tenant={tenant} onSaved={refetch} />

          {/* Messaging AI & Auto-Reply */}
          <MessagingAISection tenant={tenant} onSaved={refetch} />

          {/* Divider */}
          <div className="border-t border-[var(--border-subtle)]" />

          {/* Logo Upload */}
          <div>
            <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">Logo</label>
            <div className="flex items-center gap-4">
              {logoUrl ? (
                <div className="relative w-16 h-16 rounded-xl overflow-hidden border border-[var(--border-default)] bg-[var(--surface-raised)]">
                  <img
                    src={logoUrl}
                    alt="Business logo"
                    className="w-full h-full object-contain"
                  />
                </div>
              ) : (
                <div
                  className="w-16 h-16 rounded-xl border-2 border-dashed border-[var(--border-default)] flex items-center justify-center"
                  style={{ backgroundColor: 'var(--surface-raised)' }}
                >
                  <svg className="w-6 h-6 text-[var(--text-tertiary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5a1.5 1.5 0 001.5-1.5V5.25a1.5 1.5 0 00-1.5-1.5H3.75a1.5 1.5 0 00-1.5 1.5v14.25a1.5 1.5 0 001.5 1.5z" />
                  </svg>
                </div>
              )}
              <div className="flex flex-col gap-1.5">
                <label className="inline-flex">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleLogoUpload}
                    className="hidden"
                    disabled={uploadingLogo}
                  />
                  <span className="text-sm font-medium text-[var(--accent-primary)] hover:underline cursor-pointer">
                    {uploadingLogo ? 'Uploading…' : logoUrl ? 'Change logo' : 'Upload logo'}
                  </span>
                </label>
                {logoUrl && (
                  <button
                    onClick={removeLogo}
                    disabled={uploadingLogo}
                    className="text-xs text-red-500 hover:underline text-left"
                  >
                    Remove logo
                  </button>
                )}
                <span className="text-xs text-[var(--text-tertiary)]">PNG or JPG, max 2MB</span>
              </div>
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-[var(--border-subtle)]" />

          {/* Theme Selector */}
          <div className="space-y-3">
            <label className="block text-sm font-medium text-[var(--text-primary)]">Theme</label>
            <p className="text-sm text-[var(--text-secondary)]">
              Choose a theme to set the entire look and feel of your app.
            </p>

            {/* Light themes */}
            <div className="space-y-2">
              <span className="text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider">Light</span>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                {LIGHT_THEMES.map((theme) => (
                  <ThemePreviewCard
                    key={theme.id}
                    theme={theme}
                    isSelected={selectedThemeId === theme.id}
                    onSelect={() => selectTheme(theme.id)}
                  />
                ))}
              </div>
            </div>

            {/* Dark themes */}
            <div className="space-y-2">
              <span className="text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider">Dark</span>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                {DARK_THEMES.map((theme) => (
                  <ThemePreviewCard
                    key={theme.id}
                    theme={theme}
                    isSelected={selectedThemeId === theme.id}
                    onSelect={() => selectTheme(theme.id)}
                  />
                ))}
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button variant="primary" onClick={saveBranding} loading={savingBrand}>
                Save Theme
              </Button>
            </div>
          </div>
        </div>
      </AccordionSection>

      {/* ================================================================ */}
      {/* Section 2: Payments                                              */}
      {/* ================================================================ */}
      <AccordionSection
        icon={IconPayments}
        title="Payments"
        summary={paymentSummary}
        isOpen={openSection === 'payments'}
        onToggle={() => toggleSection('payments')}
      >
        <div className="space-y-5 pt-4">
          <p className="text-sm text-[var(--text-secondary)]">
            Connect Stripe to accept card payments directly through Sunstone Studio. Customers pay via QR code or text link — professional, fast, and fully tracked.
          </p>

          {/* Stripe card */}
          <div className={`relative rounded-xl border-2 p-5 space-y-3 transition-colors ${
            stripeConnected ? 'border-[var(--accent-primary)] bg-[var(--surface-subtle)]' : 'border-[var(--border-default)]'
          }`}>
            <div className="flex items-center justify-between">
              <span className="text-base font-semibold text-[var(--text-primary)]">Stripe Connect</span>
              {stripeConnected ? (
                <Badge variant="accent" size="sm">Connected</Badge>
              ) : (
                <Badge variant="default" size="sm">Not connected</Badge>
              )}
            </div>
            {stripeConnected ? (
              <>
                <p className="text-sm text-[var(--text-secondary)]">
                  Stripe Connected — Accept payments via QR code and text link in the POS. Processing fee ({(feeRate * 100).toFixed(feeRate > 0 ? 1 : 0)}% based on your plan) is added to the customer&apos;s total.
                </p>
                <Button variant="danger" size="sm" onClick={disconnectStripe} loading={disconnectingStripe}>
                  Disconnect Stripe
                </Button>
              </>
            ) : (
              <>
                <p className="text-sm text-[var(--text-secondary)]">
                  Connect Stripe to accept card payments directly through Sunstone Studio. Customers pay via QR code or text link — professional, fast, and fully tracked.
                </p>
                <Button variant="primary" size="sm" onClick={() => { window.location.href = '/api/stripe/authorize'; }}>
                  Connect Stripe
                </Button>
              </>
            )}
          </div>

          {/* Platform Fee Info */}
          <div className="border-t border-[var(--border-subtle)]" />
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-[var(--text-primary)]">Platform Fee</span>
              <Badge variant="default" size="sm">{(feeRate * 100).toFixed(feeRate > 0 ? 1 : 0)}%</Badge>
            </div>
            {feeRate > 0 ? (
              <>
                <p className="text-sm text-[var(--text-secondary)]">
                  A {(feeRate * 100).toFixed(1)}% service fee is automatically included in your customer&rsquo;s total when they pay through Sunstone Studio. This is standard for modern checkout platforms and covers secure payment processing, instant receipts, and transaction tracking.
                </p>
                <div className="rounded-lg bg-[var(--surface-subtle)] border border-[var(--border-default)] px-4 py-3">
                  <p className="text-sm text-[var(--text-secondary)]">
                    Example: $100 sale &rarr; customer pays ${(100 + 100 * feeRate).toFixed(2)} &rarr; you receive $100
                  </p>
                </div>
                <p className="text-xs text-[var(--text-tertiary)]">
                  {tier === 'starter'
                    ? 'Upgrade to Pro to reduce the fee to 1.5%, or Business to eliminate it entirely.'
                    : 'Upgrade to Business to eliminate the fee for your customers.'}
                </p>
              </>
            ) : (
              <p className="text-sm text-[var(--text-secondary)]">
                Your customers pay exactly what you quote &mdash; no additional fees. This is a Business plan benefit.
              </p>
            )}
          </div>
        </div>
      </AccordionSection>

      {/* ================================================================ */}
      {/* Section 3: Plan & Billing                                        */}
      {/* ================================================================ */}
      <AccordionSection
        icon={IconBilling}
        title="Plan & Billing"
        summary={billingSummary}
        isOpen={openSection === 'billing'}
        onToggle={() => toggleSection('billing')}
      >
        <div className="space-y-6 pt-4">

          {/* Trial banner */}
          {trialActive && (
            <div className="bg-gradient-to-r from-[var(--accent-50)] to-[var(--accent-100)] border border-[var(--accent-200)] rounded-2xl p-5">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-[var(--accent-primary)] flex items-center justify-center shrink-0">
                  <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-base font-semibold text-[var(--text-primary)]">
                    You&apos;re on your 60-day Pro trial
                  </h3>
                  <p className="text-sm text-[var(--text-secondary)] mt-1">
                    <span className="font-semibold text-[var(--accent-primary)]">{trialDays} day{trialDays !== 1 ? 's' : ''}</span> remaining.
                    You have full access to all Pro features. Subscribe before your trial ends to keep them.
                  </p>
                  <p className="text-xs text-[var(--text-tertiary)] mt-2">
                    After your trial, you&apos;ll drop to the Starter plan (3% fee, limited AI, no reports).
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Past due warning */}
          {isPastDue && (
            <div className="bg-error-50 border border-error-200 rounded-2xl p-5">
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-error-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" />
                </svg>
                <div>
                  <h3 className="text-base font-semibold text-error-600">Payment Failed</h3>
                  <p className="text-sm text-error-600 mt-1">
                    Your last payment didn&apos;t go through. Please update your payment method to keep your subscription active.
                  </p>
                  <Button variant="danger" className="mt-3" onClick={handleManageSubscription}>
                    Update Payment Method
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Current plan status (active subscription) */}
          {hasActiveSubscription && !isPastDue && (
            <div className="flex items-center justify-between p-4 rounded-xl border border-[var(--border-default)] bg-[var(--surface-base)]">
              <div className="flex items-center gap-3">
                <Badge variant="accent" size="md">
                  {tier.charAt(0).toUpperCase() + tier.slice(1)} Plan
                </Badge>
                <span className="text-sm text-[var(--text-secondary)]">
                  ${SUBSCRIPTION_PRICES[tier]}/mo
                </span>
                <span className="text-xs text-success-600 font-medium">Active</span>
              </div>
              <Button variant="secondary" onClick={handleManageSubscription}>
                Manage Subscription
              </Button>
            </div>
          )}

          {/* Starter plan notice */}
          {!trialActive && !hasActiveSubscription && !isPastDue && effectiveTier === 'starter' && (
            <div className="bg-warning-50 border border-warning-200 rounded-2xl p-5">
              <h3 className="text-base font-semibold text-warning-600">You&apos;re on the Starter plan</h3>
              <p className="text-sm text-warning-600 mt-1">
                Upgrade to Pro or Business to unlock lower fees, unlimited AI, reports, and more.
              </p>
            </div>
          )}

          {/* Plan cards */}
          {(!hasActiveSubscription || trialActive) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Pro card */}
              <div className="border border-[var(--border-default)] rounded-2xl p-5 space-y-4 bg-[var(--surface-base)]">
                <div>
                  <h3 className="text-lg font-bold text-[var(--text-primary)]">Pro</h3>
                  <div className="flex items-baseline gap-1 mt-1">
                    <span className="text-3xl font-bold text-[var(--text-primary)]">${SUBSCRIPTION_PRICES.pro}</span>
                    <span className="text-sm text-[var(--text-tertiary)]">/mo</span>
                  </div>
                </div>
                <ul className="space-y-2">
                  {PLAN_FEATURES.pro.map((feature) => (
                    <li key={feature} className="flex items-start gap-2 text-sm text-[var(--text-secondary)]">
                      <svg className="w-4 h-4 text-green-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      {feature}
                    </li>
                  ))}
                </ul>
                <Button
                  variant="primary"
                  className="w-full"
                  onClick={() => handleSubscribe('pro')}
                  loading={subscribing}
                >
                  {trialActive ? 'Subscribe to Pro' : 'Upgrade to Pro'}
                </Button>
              </div>

              {/* Business card */}
              <div className="border-2 border-[var(--accent-primary)] rounded-2xl p-5 space-y-4 bg-[var(--surface-base)] relative">
                <div className="absolute -top-3 right-4">
                  <Badge variant="accent" size="sm">Best Value</Badge>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-[var(--text-primary)]">Business</h3>
                  <div className="flex items-baseline gap-1 mt-1">
                    <span className="text-3xl font-bold text-[var(--text-primary)]">$279</span>
                    <span className="text-sm text-[var(--text-tertiary)]">/mo</span>
                  </div>
                </div>
                <ul className="space-y-2">
                  {PLAN_FEATURES.business.map((feature) => (
                    <li key={feature} className="flex items-start gap-2 text-sm text-[var(--text-secondary)]">
                      <svg className="w-4 h-4 text-green-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      {feature}
                    </li>
                  ))}
                </ul>
                <Button
                  variant="primary"
                  className="w-full"
                  onClick={() => handleSubscribe('business')}
                  loading={subscribing}
                >
                  {trialActive ? 'Subscribe to Business' : 'Upgrade to Business'}
                </Button>
              </div>
            </div>
          )}

          {/* CRM add-on info */}
          {trialActive ? (
            <div className="border border-[var(--border-default)] rounded-2xl p-5 bg-[var(--surface-base)]">
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-[var(--accent-primary)] shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                </svg>
                <p className="text-sm text-[var(--text-secondary)]">
                  Your Pro trial includes full CRM (dedicated phone number, two-way SMS, automated aftercare, broadcasts, workflows, and more). After your trial, CRM is $69/mo as an add-on to any plan.
                </p>
              </div>
            </div>
          ) : tier === 'starter' && !hasActiveSubscription ? (
            <div className="border border-[var(--border-default)] rounded-2xl p-5 bg-[var(--surface-base)]">
              <div className="flex items-start justify-between gap-4">
                <p className="text-sm text-[var(--text-secondary)]">
                  Add CRM to your plan for $69/mo &mdash; dedicated phone number, two-way SMS, automated workflows, broadcasts, aftercare, and more.
                </p>
                <Button variant="secondary" className="shrink-0">
                  Add CRM
                </Button>
              </div>
            </div>
          ) : null}

          {/* Next billing date */}
          {hasActiveSubscription && tenant.subscription_period_end && (
            <p className="text-xs text-[var(--text-tertiary)]">
              Next billing date: {new Date(tenant.subscription_period_end).toLocaleDateString()}
            </p>
          )}

          {/* Plan comparison table */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-[var(--text-primary)]">Plan Comparison</h4>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border-subtle)]">
                    <th className="text-left py-2 pr-4 text-[var(--text-tertiary)] font-medium">Feature</th>
                    <th className="text-center py-2 px-3 text-[var(--text-tertiary)] font-medium">Starter</th>
                    <th className="text-center py-2 px-3 text-[var(--text-tertiary)] font-medium">Pro</th>
                    <th className="text-center py-2 px-3 text-[var(--text-tertiary)] font-medium">Business</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)]">
                  <tr>
                    <td className="py-2.5 pr-4 text-[var(--text-secondary)]">
                      Processing fee
                      <span className="block text-xs text-[var(--text-tertiary)]">(customer pays)</span>
                    </td>
                    <td className="py-2.5 px-3 text-center text-[var(--text-primary)]">3%</td>
                    <td className="py-2.5 px-3 text-center text-[var(--text-primary)]">1.5%</td>
                    <td className="py-2.5 px-3 text-center text-success-600 font-semibold">0%</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 pr-4 text-[var(--text-secondary)]">Integrated payments</td>
                    <td className="py-2.5 px-3 text-center text-success-600">✓</td>
                    <td className="py-2.5 px-3 text-center text-success-600">✓</td>
                    <td className="py-2.5 px-3 text-center text-success-600">✓</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 pr-4 text-[var(--text-secondary)]">Sunny AI</td>
                    <td className="py-2.5 px-3 text-center text-[var(--text-tertiary)]">5/mo</td>
                    <td className="py-2.5 px-3 text-center text-[var(--text-primary)]">Unlimited</td>
                    <td className="py-2.5 px-3 text-center text-[var(--text-primary)]">Unlimited</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 pr-4 text-[var(--text-secondary)]">Business insights</td>
                    <td className="py-2.5 px-3 text-center text-[var(--text-tertiary)]">—</td>
                    <td className="py-2.5 px-3 text-center text-success-600">✓</td>
                    <td className="py-2.5 px-3 text-center text-success-600">✓</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 pr-4 text-[var(--text-secondary)]">Full P&amp;L reports</td>
                    <td className="py-2.5 px-3 text-center text-[var(--text-tertiary)]">—</td>
                    <td className="py-2.5 px-3 text-center text-success-600">✓</td>
                    <td className="py-2.5 px-3 text-center text-success-600">✓</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 pr-4 text-[var(--text-secondary)]">
                      CRM Available
                      <span className="block text-xs text-[var(--text-tertiary)]">($69/mo add-on, free during trial)</span>
                    </td>
                    <td className="py-2.5 px-3 text-center text-success-600">✓</td>
                    <td className="py-2.5 px-3 text-center text-success-600">✓</td>
                    <td className="py-2.5 px-3 text-center text-success-600">✓</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 pr-4 text-[var(--text-secondary)]">Team members</td>
                    <td className="py-2.5 px-3 text-center text-[var(--text-primary)]">1</td>
                    <td className="py-2.5 px-3 text-center text-[var(--text-primary)]">3</td>
                    <td className="py-2.5 px-3 text-center text-[var(--text-primary)]">Unlimited</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 pr-4 text-[var(--text-secondary)]">Price</td>
                    <td className="py-2.5 px-3 text-center text-[var(--text-primary)] font-semibold">${SUBSCRIPTION_PRICES.starter}/mo</td>
                    <td className="py-2.5 px-3 text-center text-[var(--text-primary)] font-semibold">${SUBSCRIPTION_PRICES.pro}/mo</td>
                    <td className="py-2.5 px-3 text-center text-[var(--text-primary)] font-semibold">${SUBSCRIPTION_PRICES.business}/mo</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </AccordionSection>

      {/* ================================================================ */}
      {/* Section 4: Tax & Receipts                                     */}
      {/* ================================================================ */}
      <AccordionSection
        icon={IconTax}
        title="Tax & Receipts"
        summary={taxSummary}
        isOpen={openSection === 'tax'}
        onToggle={() => toggleSection('tax')}
      >
        <div className="space-y-4 pt-4">
          {taxProfiles.length > 0 && (
            <div className="space-y-2">
              {taxProfiles.map((tp) => (
                <div
                  key={tp.id}
                  className="flex items-center justify-between bg-[var(--surface-base)] rounded-lg px-4 py-3"
                >
                  <div>
                    <span className="font-medium text-[var(--text-primary)]">{tp.name}</span>
                    <span className="text-[var(--text-tertiary)] ml-2">
                      {(tp.rate * 100).toFixed(2)}%
                    </span>
                  </div>
                  <Button variant="danger" size="sm" onClick={() => deleteTaxProfile(tp.id)}>
                    Remove
                  </Button>
                </div>
              ))}
            </div>
          )}
          {taxProfiles.length === 0 && (
            <p className="text-sm text-[var(--text-tertiary)]">No tax profiles yet. Add one below.</p>
          )}
          <div className="flex gap-2">
            <div className="flex-1">
              <Input
                placeholder="Profile name (e.g. Texas)"
                value={newTax.name}
                onChange={(e) => setNewTax({ ...newTax, name: e.target.value })}
              />
            </div>
            <div className="w-28">
              <Input
                type="number"
                step="0.01"
                placeholder="Rate %"
                value={newTax.rate}
                onChange={(e) => setNewTax({ ...newTax, rate: e.target.value })}
              />
            </div>
            <Button variant="secondary" onClick={addTaxProfile}>
              Add
            </Button>
          </div>
        </div>

        {/* ── Receipts subsection ── */}
        <div className="border-t border-[var(--border-subtle)] mt-6 pt-6">
          <h4 className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-tertiary)] mb-4">Receipts</h4>

          <div className="space-y-4">
            {/* Auto-send email toggle */}
            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-sm text-[var(--text-primary)]">Auto-send email receipt after sale</span>
              <button
                type="button"
                role="switch"
                aria-checked={autoEmailReceipt}
                onClick={() => setAutoEmailReceipt(!autoEmailReceipt)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  autoEmailReceipt ? 'bg-[var(--accent-primary)]' : 'bg-[var(--border-strong)]'
                }`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  autoEmailReceipt ? 'translate-x-6' : 'translate-x-1'
                }`} />
              </button>
            </label>

            {/* Auto-send SMS toggle */}
            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-sm text-[var(--text-primary)]">Auto-send SMS receipt after sale</span>
              <button
                type="button"
                role="switch"
                aria-checked={autoSmsReceipt}
                onClick={() => setAutoSmsReceipt(!autoSmsReceipt)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  autoSmsReceipt ? 'bg-[var(--accent-primary)]' : 'bg-[var(--border-strong)]'
                }`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  autoSmsReceipt ? 'translate-x-6' : 'translate-x-1'
                }`} />
              </button>
            </label>

            {/* Receipt footer */}
            <div>
              <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Receipt footer message</label>
              <Input
                placeholder="Thank you for choosing us!"
                value={receiptFooter}
                onChange={(e) => setReceiptFooter(e.target.value.slice(0, 200))}
                maxLength={200}
              />
              <p className="text-xs text-[var(--text-tertiary)] mt-1">{receiptFooter.length}/200 characters</p>
            </div>

            {/* Business tagline */}
            <div>
              <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Business tagline</label>
              <Input
                placeholder="Permanent jewelry, permanently yours"
                value={receiptTagline}
                onChange={(e) => setReceiptTagline(e.target.value.slice(0, 100))}
                maxLength={100}
              />
              <p className="text-xs text-[var(--text-tertiary)] mt-1">{receiptTagline.length}/100 characters</p>
            </div>

            <div className="flex justify-end">
              <Button variant="primary" onClick={saveReceiptSettings} disabled={savingReceipts}>
                {savingReceipts ? 'Saving...' : 'Save Receipt Settings'}
              </Button>
            </div>
          </div>
        </div>
      </AccordionSection>

      {/* ================================================================ */}
      {/* Section 5: Waiver                                                */}
      {/* ================================================================ */}
      <AccordionSection
        icon={IconWaiver}
        title="Waiver"
        summary={waiverSummary}
        isOpen={openSection === 'waiver'}
        onToggle={() => toggleSection('waiver')}
      >
        <div className="space-y-4 pt-4">
          <p className="text-sm text-[var(--text-secondary)]">
            This text is shown to customers when they sign a waiver before their appointment.
          </p>
          <Textarea
            value={waiverText}
            onChange={(e) => setWaiverText(e.target.value)}
            rows={6}
          />
          <div className="flex justify-end">
            <Button variant="primary" onClick={() => setShowWaiverConfirm(true)}>
              Save Waiver Text
            </Button>
          </div>
        </div>
      </AccordionSection>

      {/* ================================================================ */}
      {/* Section 6: Team                                                  */}
      {/* ================================================================ */}
      {showTeamSection && (
        <AccordionSection
          icon={IconTeam}
          title="Team"
          summary={teamSummary}
          isOpen={openSection === 'team'}
          onToggle={() => toggleSection('team')}
        >
          <div className="space-y-5 pt-4">
            {(() => {
              const effectiveTierForTeam = tenant ? getSubscriptionTier(tenant) : 'starter';
              const memberLimit = TEAM_MEMBER_LIMITS[effectiveTierForTeam] || 1;
              const totalMembers = activeMembers.length + pendingMembers.length;
              const atLimit = totalMembers >= memberLimit;
              const limitLabel = memberLimit === Infinity ? '∞' : String(memberLimit);

              return (
                <>
                  {/* Header with invite button */}
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-[var(--text-secondary)]">
                      {memberLimit === Infinity
                        ? `${totalMembers} team member${totalMembers !== 1 ? 's' : ''} — unlimited on Business`
                        : `${totalMembers} of ${limitLabel} team member${memberLimit !== 1 ? 's' : ''}`
                      }
                    </p>
                    <Button
                      variant="primary"
                      onClick={() => setShowInviteModal(true)}
                      disabled={atLimit}
                      title={atLimit ? 'Team member limit reached for your plan' : 'Invite a new team member'}
                    >
                      <span className="flex items-center gap-2">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                        </svg>
                        Invite
                      </span>
                    </Button>
                  </div>

                  {/* Tier upgrade messages */}
                  {atLimit && effectiveTierForTeam === 'starter' && (
                    <div className="p-4 rounded-xl border border-[var(--accent-200)] bg-[var(--accent-50)]/30">
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-full bg-[var(--accent-100)] flex items-center justify-center shrink-0 mt-0.5">
                          <svg className="w-4 h-4 text-[var(--accent-600)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                          </svg>
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-medium text-[var(--text-primary)]">Add team members with Pro</p>
                          <p className="text-sm text-[var(--text-secondary)] mt-0.5">
                            The Starter plan includes 1 team member (you). Upgrade to Pro for up to 3 team members, or Business for unlimited.
                          </p>
                          <button
                            onClick={() => toggleSection('billing')}
                            className="inline-flex items-center gap-1 text-sm font-medium text-[var(--accent-primary)] hover:underline mt-2"
                          >
                            View Plans
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                  {atLimit && effectiveTierForTeam === 'pro' && (
                    <div className="p-4 rounded-xl border border-[var(--accent-200)] bg-[var(--accent-50)]/30">
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-full bg-[var(--accent-100)] flex items-center justify-center shrink-0 mt-0.5">
                          <svg className="w-4 h-4 text-[var(--accent-600)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
                          </svg>
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-medium text-[var(--text-primary)]">Need more team members?</p>
                          <p className="text-sm text-[var(--text-secondary)] mt-0.5">
                            Pro includes up to 3 team members. Upgrade to Business for unlimited team members.
                          </p>
                          <button
                            onClick={() => toggleSection('billing')}
                            className="inline-flex items-center gap-1 text-sm font-medium text-[var(--accent-primary)] hover:underline mt-2"
                          >
                            View Plans
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              );
            })()}

            {/* Active Members */}
            {teamLoading ? (
              <p className="text-sm text-[var(--text-tertiary)] py-4 text-center">Loading…</p>
            ) : activeMembers.length === 0 ? (
              <p className="text-sm text-[var(--text-tertiary)] py-4 text-center">
                No team members yet. Invite someone to get started.
              </p>
            ) : (
              <div>
                <h4 className="text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wider mb-2">
                  Active ({activeMembers.length})
                </h4>
                <div className="divide-y divide-[var(--border-subtle)] border border-[var(--border-default)] rounded-xl overflow-hidden">
                  {activeMembers.map((member) => (
                    <div key={member.id} className="flex items-center justify-between py-3 px-4 gap-3 bg-[var(--surface-base)]">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-[var(--text-primary)] truncate">
                            {member.display_name || member.invited_email || 'Unknown'}
                          </span>
                          {member.is_owner && (
                            <Badge variant="accent" size="sm">Owner</Badge>
                          )}
                        </div>
                        {member.invited_email && member.display_name && (
                          <div className="text-xs text-[var(--text-tertiary)] truncate">
                            {member.invited_email}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {member.is_owner ? (
                          <Badge variant={ROLE_CONFIG.admin.variant} size="md">
                            {ROLE_CONFIG.admin.label}
                          </Badge>
                        ) : (
                          <select
                            value={member.role}
                            onChange={(e) => handleChangeRole(member, e.target.value as TenantRole)}
                            className="text-xs rounded-lg border border-[var(--border-default)] bg-[var(--surface-base)] px-2.5 py-1.5 text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)] min-h-[36px]"
                          >
                            {ALL_ROLE_OPTIONS.map((opt) => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                        )}
                        {!member.is_owner && (
                          <button
                            onClick={() => setConfirmRemove(member)}
                            className="p-1.5 min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg text-[var(--text-tertiary)] hover:text-error-500 hover:bg-error-50 transition-colors"
                            title="Remove member"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Pending Invites */}
            {pendingMembers.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wider mb-2">
                  Pending Invites ({pendingMembers.length})
                </h4>
                <div className="divide-y divide-[var(--border-subtle)] border border-[var(--border-default)] rounded-xl overflow-hidden">
                  {pendingMembers.map((member) => (
                    <div key={member.id} className="flex items-center justify-between py-3 px-4 gap-3 bg-[var(--surface-base)]">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-[var(--text-secondary)] truncate">
                            {member.invited_email || 'Unknown'}
                          </span>
                          <Badge variant="warning" size="sm">Pending</Badge>
                          <Badge variant={ROLE_CONFIG[member.role].variant} size="sm">
                            {ROLE_CONFIG[member.role].label}
                          </Badge>
                        </div>
                        {member.display_name && (
                          <div className="text-xs text-[var(--text-tertiary)]">{member.display_name}</div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Button variant="ghost" size="sm" onClick={() => handleResendInvite(member)}>
                          Resend
                        </Button>
                        <button
                          onClick={() => setConfirmRemove(member)}
                          className="p-1.5 min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg text-[var(--text-tertiary)] hover:text-error-500 hover:bg-error-50 transition-colors"
                          title="Cancel invite"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Role legend */}
            <div className="space-y-2 pt-2 border-t border-[var(--border-subtle)]">
              <h4 className="text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">
                Role Permissions
              </h4>
              <div className="space-y-2 text-sm">
                <div>
                  <span className="font-medium text-[var(--text-primary)]">Admin</span>
                  <span className="text-[var(--text-secondary)] ml-2">
                    — Full access to everything including settings, payments, and team management.
                  </span>
                </div>
                <div>
                  <span className="font-medium text-[var(--text-primary)]">Manager</span>
                  <span className="text-[var(--text-secondary)] ml-2">
                    — Can use POS, manage inventory and events, view reports, apply discounts, and process refunds.
                  </span>
                </div>
                <div>
                  <span className="font-medium text-[var(--text-primary)]">Staff</span>
                  <span className="text-[var(--text-secondary)] ml-2">
                    — Can use POS, manage queue, and view inventory/events/clients.
                  </span>
                </div>
              </div>
            </div>
          </div>
        </AccordionSection>
      )}

      {/* ================================================================ */}
      {/* Invite Modal                                                     */}
      {/* ================================================================ */}
      <Modal isOpen={showInviteModal} onClose={() => setShowInviteModal(false)} size="sm">
        <ModalHeader>
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">Invite Team Member</h2>
        </ModalHeader>
        <ModalBody className="space-y-4">
          <Input
            label="Email Address"
            type="email"
            placeholder="team@example.com"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
          />
          <Select
            label="Role"
            value={inviteRole}
            onChange={(e) => setInviteRole(e.target.value as TenantRole)}
            options={ROLE_OPTIONS}
          />
          <Input
            label="Display Name (optional)"
            placeholder="Jane Smith"
            value={inviteName}
            onChange={(e) => setInviteName(e.target.value)}
            helperText="How they'll appear in the team list."
          />
        </ModalBody>
        <ModalFooter>
          <Button variant="ghost" onClick={() => setShowInviteModal(false)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleInvite} loading={inviting}>
            Send Invite
          </Button>
        </ModalFooter>
      </Modal>

      {/* ================================================================ */}
      {/* Remove Confirmation Modal                                        */}
      {/* ================================================================ */}
      <Modal
        isOpen={!!confirmRemove}
        onClose={() => setConfirmRemove(null)}
        size="sm"
      >
        <ModalHeader>
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">
            {confirmRemove?.is_pending ? 'Cancel Invite' : 'Remove Team Member'}
          </h2>
        </ModalHeader>
        <ModalBody>
          <p className="text-sm text-[var(--text-secondary)]">
            {confirmRemove?.is_pending
              ? `Cancel the pending invite for ${confirmRemove.invited_email}? They won't be able to join your team.`
              : `Remove ${confirmRemove?.display_name || confirmRemove?.invited_email} from your team? They'll lose access to your business on Sunstone.`
            }
          </p>
        </ModalBody>
        <ModalFooter>
          <Button variant="ghost" onClick={() => setConfirmRemove(null)}>
            Keep
          </Button>
          <Button variant="danger" onClick={handleRemoveMember} loading={removing}>
            {confirmRemove?.is_pending ? 'Cancel Invite' : 'Remove'}
          </Button>
        </ModalFooter>
      </Modal>

      {/* ================================================================ */}
      {/* Waiver Save Confirmation Modal                                   */}
      {/* ================================================================ */}
      <Modal
        isOpen={showWaiverConfirm}
        onClose={() => setShowWaiverConfirm(false)}
        size="sm"
      >
        <ModalHeader>
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">Update Waiver Text</h2>
        </ModalHeader>
        <ModalBody>
          <p className="text-sm text-[var(--text-secondary)]">
            Are you sure you want to update the waiver text? This change will apply to all future waivers shown to your customers.
          </p>
        </ModalBody>
        <ModalFooter>
          <Button variant="ghost" onClick={() => setShowWaiverConfirm(false)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={saveWaiverText}>
            Update Waiver
          </Button>
        </ModalFooter>
      </Modal>

      <SunnyTutorial
        pageKey="settings"
        tips={[
          { title: 'Connect Stripe first', body: 'Link your Stripe account to accept payments via QR code or text link. No card reader needed — takes about 5 minutes.' },
          { title: 'Set up tax profiles', body: 'Create tax profiles for different rates (e.g. state vs county). Assign them to events for automatic tax calculation.' },
        ]}
      />
    </div>
  );
}

// ============================================================================
// Dedicated Phone Number Section
// ============================================================================

function DedicatedPhoneSection({ tenant, onProvisioned }: { tenant: any; onProvisioned: () => void }) {
  const [provisioning, setProvisioning] = useState(false);
  const [releasing, setReleasing] = useState(false);
  const [confirmRelease, setConfirmRelease] = useState(false);

  const dedicatedNumber = tenant?.dedicated_phone_number;

  const formatPhoneDisplay = (phone: string) => {
    const digits = phone.replace(/\D/g, '');
    const last10 = digits.slice(-10);
    if (last10.length === 10) {
      return `(${last10.slice(0, 3)}) ${last10.slice(3, 6)}-${last10.slice(6)}`;
    }
    return phone;
  };

  const handleProvision = async () => {
    setProvisioning(true);
    try {
      const res = await fetch('/api/twilio/provision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      onProvisioned();
    } catch (err: any) {
      console.error('Provision failed:', err);
    } finally {
      setProvisioning(false);
    }
  };

  const handleRelease = async () => {
    setReleasing(true);
    try {
      const res = await fetch('/api/twilio/release', { method: 'POST' });
      if (!res.ok) throw new Error('Release failed');
      setConfirmRelease(false);
      onProvisioned();
    } catch (err: any) {
      console.error('Release failed:', err);
    } finally {
      setReleasing(false);
    }
  };

  return (
    <div>
      <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
        Dedicated Text Number
      </label>
      {dedicatedNumber ? (
        <div className="bg-[var(--surface-raised)] border border-[var(--border-default)] rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-lg font-semibold text-[var(--text-primary)]">
                {formatPhoneDisplay(dedicatedNumber)}
              </p>
              <p className="text-sm text-[var(--text-tertiary)] mt-0.5">
                Clients text this number and you see their messages in the app.
              </p>
            </div>
            {!confirmRelease ? (
              <button
                onClick={() => setConfirmRelease(true)}
                className="text-sm text-[var(--text-tertiary)] hover:text-red-500 transition-colors"
              >
                Change
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setConfirmRelease(false)}
                  className="text-sm text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
                >
                  Cancel
                </button>
                <Button
                  variant="secondary"
                  onClick={handleRelease}
                  loading={releasing}
                  className="text-red-500 border-red-200 hover:bg-red-50"
                >
                  Release Number
                </Button>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-[var(--surface-raised)] border border-[var(--border-default)] rounded-xl p-4 flex items-center justify-between">
          <p className="text-sm text-[var(--text-tertiary)]">
            No number assigned. Get a dedicated number so clients can text you directly.
          </p>
          <Button variant="primary" onClick={handleProvision} loading={provisioning}>
            Get a Number
          </Button>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Call Handling Section
// ============================================================================

function CallHandlingSection({ tenant, onSaved }: { tenant: any; onSaved: () => void }) {
  const [callHandling, setCallHandling] = useState<string>(tenant?.call_handling || 'text_only');
  const [forwardNumber, setForwardNumber] = useState<string>(tenant?.call_forward_number || '');
  const [greeting, setGreeting] = useState<string>(tenant?.call_greeting || '');
  const [muteDuringEvents, setMuteDuringEvents] = useState<boolean>(tenant?.call_mute_during_events ?? true);
  const [saving, setSaving] = useState(false);

  // Don't show if no dedicated number
  if (!tenant?.dedicated_phone_number) return null;

  const handleSave = async () => {
    if (callHandling === 'forward' && !forwardNumber.trim()) {
      toast.error('Please enter a phone number to forward calls to.');
      return;
    }
    if (greeting.length > 200) {
      toast.error('Custom greeting must be 200 characters or less.');
      return;
    }

    setSaving(true);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('tenants')
        .update({
          call_handling: callHandling,
          call_forward_number: callHandling === 'forward' ? forwardNumber.trim() : tenant.call_forward_number,
          call_greeting: greeting.trim() || null,
          call_mute_during_events: muteDuringEvents,
        })
        .eq('id', tenant.id);

      if (error) throw error;
      toast.success('Call settings saved');
      onSaved();
    } catch (err: any) {
      console.error('Failed to save call settings:', err);
      toast.error('Failed to save call settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <label className="block text-sm font-medium text-[var(--text-primary)] mb-3">
        <span className="flex items-center gap-2">
          <svg className="w-4 h-4 text-[var(--text-secondary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
          </svg>
          Incoming Calls
        </span>
      </label>
      <p className="text-xs text-[var(--text-tertiary)] mb-4">When someone calls your business number:</p>

      <div className="space-y-3 mb-4">
        {/* Text Only */}
        <label className="flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors hover:bg-[var(--surface-subtle)] border-[var(--border-default)]"
          style={callHandling === 'text_only' ? { borderColor: 'var(--accent-500)', background: 'var(--surface-subtle)' } : {}}
        >
          <input
            type="radio"
            name="call_handling"
            value="text_only"
            checked={callHandling === 'text_only'}
            onChange={() => setCallHandling('text_only')}
            className="mt-0.5 accent-[var(--accent-500)]"
          />
          <div>
            <p className="text-sm font-medium text-[var(--text-primary)]">Text Only <span className="text-xs font-normal text-[var(--text-tertiary)]">(recommended)</span></p>
            <p className="text-xs text-[var(--text-tertiary)] mt-0.5">Plays a greeting asking callers to text instead.</p>
          </div>
        </label>

        {/* Forward to My Phone */}
        <label className="flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors hover:bg-[var(--surface-subtle)] border-[var(--border-default)]"
          style={callHandling === 'forward' ? { borderColor: 'var(--accent-500)', background: 'var(--surface-subtle)' } : {}}
        >
          <input
            type="radio"
            name="call_handling"
            value="forward"
            checked={callHandling === 'forward'}
            onChange={() => setCallHandling('forward')}
            className="mt-0.5 accent-[var(--accent-500)]"
          />
          <div className="flex-1">
            <p className="text-sm font-medium text-[var(--text-primary)]">Forward to My Phone</p>
            <p className="text-xs text-[var(--text-tertiary)] mt-0.5">Rings your personal phone. Your business number shows as caller ID.</p>
            {callHandling === 'forward' && (
              <div className="mt-2">
                <Input
                  type="tel"
                  placeholder="(555) 123-4567"
                  value={forwardNumber}
                  onChange={(e) => setForwardNumber(e.target.value)}
                />
              </div>
            )}
          </div>
        </label>

        {/* Ring in App (future) */}
        <div className="flex items-start gap-3 p-3 rounded-xl border border-[var(--border-default)] opacity-50 cursor-not-allowed">
          <input
            type="radio"
            name="call_handling"
            value="ring_in_app"
            disabled
            className="mt-0.5"
          />
          <div>
            <p className="text-sm font-medium text-[var(--text-tertiary)]">Ring in App <span className="text-xs font-normal">— available with mobile app</span></p>
            <p className="text-xs text-[var(--text-tertiary)] mt-0.5">Your phone rings through the Sunstone Studio app.</p>
          </div>
        </div>
      </div>

      {/* Custom Greeting */}
      <div className="mb-4">
        <Textarea
          label="Custom Greeting (optional)"
          value={greeting}
          onChange={(e) => setGreeting(e.target.value.slice(0, 200))}
          placeholder={`Hi, you've reached ${tenant?.name || 'us'}!`}
          rows={2}
        />
        <p className="text-xs text-[var(--text-tertiary)] mt-1">
          {greeting.length}/200 characters. Default: &ldquo;Hi, you&rsquo;ve reached {tenant?.name || 'your business name'}.&rdquo;
        </p>
      </div>

      {/* Mute during events */}
      <label className="flex items-center gap-3 mb-4 cursor-pointer">
        <input
          type="checkbox"
          checked={muteDuringEvents}
          onChange={(e) => setMuteDuringEvents(e.target.checked)}
          className="w-4 h-4 rounded accent-[var(--accent-500)]"
        />
        <div>
          <p className="text-sm text-[var(--text-primary)]">Mute calls during events</p>
          <p className="text-xs text-[var(--text-tertiary)]">Calls go to text-only greeting while you&rsquo;re running an event.</p>
        </div>
      </label>

      <div className="flex justify-end">
        <Button variant="primary" onClick={handleSave} loading={saving}>
          Save Call Settings
        </Button>
      </div>
    </div>
  );
}

// ============================================================================
// Messaging AI & Auto-Reply Section
// ============================================================================

function MessagingAISection({ tenant, onSaved }: { tenant: any; onSaved: () => void }) {
  const [sunnyMode, setSunnyMode] = useState<string>(tenant?.sunny_text_mode || 'off');
  const [autoReplyEnabled, setAutoReplyEnabled] = useState<boolean>(tenant?.auto_reply_enabled || false);
  const [autoReplyMsg, setAutoReplyMsg] = useState<string>(
    tenant?.auto_reply_message || "Thanks for your message! I'm currently with a client but will get back to you as soon as I can."
  );
  const [saving, setSaving] = useState(false);

  // Don't show if no dedicated number
  if (!tenant?.dedicated_phone_number) return null;

  const handleSave = async () => {
    setSaving(true);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('tenants')
        .update({
          sunny_text_mode: sunnyMode,
          auto_reply_enabled: autoReplyEnabled,
          auto_reply_message: autoReplyMsg.trim() || null,
        })
        .eq('id', tenant.id);

      if (error) throw error;
      toast.success('Messaging settings saved');
      onSaved();
    } catch (err: any) {
      console.error('Failed to save messaging settings:', err);
      toast.error('Failed to save messaging settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <label className="block text-sm font-medium text-[var(--text-primary)] mb-3">
        <span className="flex items-center gap-2">
          <svg className="w-4 h-4 text-[var(--text-secondary)]" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 2L14.09 8.26L20 9.27L15.55 13.97L16.91 20L12 16.9L7.09 20L8.45 13.97L4 9.27L9.91 8.26L12 2Z" />
          </svg>
          Sunny AI Text Responder
        </span>
      </label>
      <p className="text-xs text-[var(--text-tertiary)] mb-4">
        Let Sunny draft or auto-send replies when clients text your business number.
      </p>

      <div className="space-y-3 mb-5">
        {/* Off */}
        <label
          className="flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors hover:bg-[var(--surface-subtle)] border-[var(--border-default)]"
          style={sunnyMode === 'off' ? { borderColor: 'var(--accent-500)', background: 'var(--surface-subtle)' } : {}}
        >
          <input type="radio" name="sunny_mode" value="off" checked={sunnyMode === 'off'} onChange={() => setSunnyMode('off')} className="mt-0.5 accent-[var(--accent-500)]" />
          <div>
            <p className="text-sm font-medium text-[var(--text-primary)]">Off</p>
            <p className="text-xs text-[var(--text-tertiary)] mt-0.5">You reply to all messages yourself.</p>
          </div>
        </label>

        {/* Suggest */}
        <label
          className="flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors hover:bg-[var(--surface-subtle)] border-[var(--border-default)]"
          style={sunnyMode === 'suggest' ? { borderColor: 'var(--accent-500)', background: 'var(--surface-subtle)' } : {}}
        >
          <input type="radio" name="sunny_mode" value="suggest" checked={sunnyMode === 'suggest'} onChange={() => setSunnyMode('suggest')} className="mt-0.5 accent-[var(--accent-500)]" />
          <div>
            <p className="text-sm font-medium text-[var(--text-primary)]">Suggest <span className="text-xs font-normal text-[var(--text-tertiary)]">(recommended)</span></p>
            <p className="text-xs text-[var(--text-tertiary)] mt-0.5">Sunny drafts a response you can use, edit, or ignore. You always review before sending.</p>
          </div>
        </label>

        {/* Auto */}
        <label
          className="flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors hover:bg-[var(--surface-subtle)] border-[var(--border-default)]"
          style={sunnyMode === 'auto' ? { borderColor: 'var(--accent-500)', background: 'var(--surface-subtle)' } : {}}
        >
          <input type="radio" name="sunny_mode" value="auto" checked={sunnyMode === 'auto'} onChange={() => setSunnyMode('auto')} className="mt-0.5 accent-[var(--accent-500)]" />
          <div>
            <p className="text-sm font-medium text-[var(--text-primary)]">Auto-Send</p>
            <p className="text-xs text-[var(--text-tertiary)] mt-0.5">Sunny automatically replies to client messages. Great for when you are busy welding.</p>
          </div>
        </label>
      </div>

      {/* Auto-Reply (event mode) */}
      <div className="border-t border-[var(--border-subtle)] pt-4 mb-4">
        <label className="flex items-center gap-3 mb-3 cursor-pointer">
          <input
            type="checkbox"
            checked={autoReplyEnabled}
            onChange={(e) => setAutoReplyEnabled(e.target.checked)}
            className="w-4 h-4 rounded accent-[var(--accent-500)]"
          />
          <div>
            <p className="text-sm text-[var(--text-primary)]">Event mode auto-reply</p>
            <p className="text-xs text-[var(--text-tertiary)]">Send an instant response when you toggle auto-reply in event mode.</p>
          </div>
        </label>

        {autoReplyEnabled && (
          <div>
            <Textarea
              label="Auto-reply message"
              value={autoReplyMsg}
              onChange={(e) => setAutoReplyMsg(e.target.value.slice(0, 300))}
              placeholder="Thanks for your message! I'm with a client but will get back to you soon."
              rows={2}
            />
            <p className="text-xs text-[var(--text-tertiary)] mt-1">{autoReplyMsg.length}/300 characters</p>
          </div>
        )}
      </div>

      <div className="flex justify-end">
        <Button variant="primary" onClick={handleSave} loading={saving}>
          Save Messaging Settings
        </Button>
      </div>
    </div>
  );
}

export default function SettingsPageWrapper() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><p className="text-[var(--text-secondary)]">Loading...</p></div>}>
      <SettingsPage />
    </Suspense>
  );
}
