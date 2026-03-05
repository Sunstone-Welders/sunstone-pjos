// ============================================================================
// Dashboard Layout v6 — src/app/dashboard/layout.tsx
// ============================================================================
// v6: 3-breakpoint responsive nav (phone tabs, tablet icon sidebar, desktop
//     full sidebar), Sunny pill button, More sheet, event-mode bypass
// ============================================================================

'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { TenantProvider, useTenant } from '@/hooks/use-tenant';
import { ThemeProvider } from '@/components/themeprovider';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import type { Permission } from '@/lib/permissions';
import MentorChat from '@/components/MentorChat';
import QuickReplyToast from '@/components/QuickReplyToast';
import { getSubscriptionTier, isTrialActive } from '@/lib/subscription';
import { getCrmStatus } from '@/lib/crm-status';

// ============================================================================
// Unread message count hook (polls every 30s)
// ============================================================================

function useUnreadCount() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const fetchCount = () => {
      fetch('/api/conversations/unread-count')
        .then(r => r.ok ? r.json() : { count: 0 })
        .then(d => setCount(d.count || 0))
        .catch(() => {});
    };

    fetchCount();
    const interval = setInterval(fetchCount, 30000);
    return () => clearInterval(interval);
  }, []);

  return count;
}

// ============================================================================
// Spotlight mini card data (from /api/dashboard/spotlight)
// ============================================================================

interface SpotlightMiniData {
  title: string;
  url: string;
  imageUrl: string | null;
  badge: string;
  price: string | null;
  salePrice: string | null;
}

// ============================================================================
// Nav item definitions
// ============================================================================

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  requirePermission?: Permission;
  group?: string;
  requireCrm?: boolean;
}

/** All sidebar nav items (visible in sidebar + tablet sidebar) */
const sidebarItems: NavItem[] = [
  { href: '/dashboard',           label: 'Home',       icon: HomeIcon },
  { href: '/dashboard/events',    label: 'Events',     icon: EventsIcon },
  { href: '/dashboard/pos',       label: 'POS',        icon: POSIcon },
  { href: '/dashboard/clients',   label: 'Clients',    icon: ClientsIcon },
  { href: '/dashboard/messages',  label: 'Messages',   icon: MessagesIcon },
  // CRM group (single item — Broadcasts page has Workflows tab)
  { href: '/dashboard/broadcasts', label: 'CRM', icon: BroadcastsIcon, group: 'CRM', requireCrm: true },
  // Other
  { href: '/dashboard/inventory',  label: 'Inventory',  icon: InventoryIcon },
  { href: '/dashboard/gift-cards', label: 'Gift Cards', icon: GiftCardIcon },
  { href: '/dashboard/reports',    label: 'Reports',    icon: ReportsIcon },
  { href: '/dashboard/settings',   label: 'Settings',   icon: SettingsIcon, requirePermission: 'settings:manage' },
];

/** Phone bottom tabs — Home, POS (center), Messages, CRM, More */
const phoneTabItems: NavItem[] = [
  { href: '/dashboard',          label: 'Home',     icon: HomeIcon },
  // POS is rendered separately as the raised center button
  { href: '/dashboard/messages', label: 'Messages', icon: MessagesIcon },
  { href: '/dashboard/broadcasts', label: 'CRM', icon: BroadcastsIcon, requireCrm: true },
];

/** More sheet items — items NOT on the phone tab bar */
const moreSheetItems: NavItem[] = [
  { href: '/dashboard/events',     label: 'Events',     icon: EventsIcon },
  { href: '/dashboard/clients',    label: 'Clients',    icon: ClientsIcon },
  { href: '/dashboard/inventory',  label: 'Inventory',  icon: InventoryIcon },
  { href: '/dashboard/gift-cards', label: 'Gift Cards', icon: GiftCardIcon },
  { href: '/dashboard/reports',    label: 'Reports',    icon: ReportsIcon },
  { href: '/dashboard/settings',   label: 'Settings',   icon: SettingsIcon, requirePermission: 'settings:manage' },
];

// ============================================================================
// Root export
// ============================================================================

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <TenantProvider>
      <TenantThemeBridge>
        <DashboardInnerLayout>{children}</DashboardInnerLayout>
      </TenantThemeBridge>
    </TenantProvider>
  );
}

// ============================================================================
// Theme bridge (unchanged)
// ============================================================================

function TenantThemeBridge({ children }: { children: React.ReactNode }) {
  const { tenant } = useTenant();
  return (
    <ThemeProvider themeId={tenant?.theme_id || null}>
      {children}
    </ThemeProvider>
  );
}

// ============================================================================
// Inner layout — owns Sunny + More state, detects event mode
// ============================================================================

function DashboardInnerLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { tenant, isLoading: tenantLoading, isOwner } = useTenant();
  const [isSunnyOpen, setIsSunnyOpen] = useState(false);
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const [spotlight, setSpotlight] = useState<SpotlightMiniData | null>(null);
  const [spotlightDismissed, setSpotlightDismissed] = useState(false);

  const openSunny = useCallback(() => setIsSunnyOpen(true), []);
  const closeSunny = useCallback(() => setIsSunnyOpen(false), []);
  const openMore = useCallback(() => setIsMoreOpen(true), []);
  const closeMore = useCallback(() => setIsMoreOpen(false), []);

  // Redirect owners who haven't completed onboarding
  useEffect(() => {
    if (!tenantLoading && tenant && isOwner && !tenant.onboarding_completed) {
      router.replace('/onboarding');
    }
  }, [tenantLoading, tenant, isOwner, router]);

  // Lazy CRM trial check (fire-and-forget on dashboard load)
  useEffect(() => {
    if (!tenantLoading && tenant) {
      fetch('/api/crm/check-trial', { method: 'POST' }).catch(() => {});
    }
  }, [tenantLoading, tenant]);

  // Fetch spotlight data for mini card (once on mount)
  useEffect(() => {
    let cancelled = false;
    async function fetchSpotlight() {
      try {
        const res = await fetch('/api/dashboard/spotlight');
        if (res.ok) {
          const data = await res.json();
          if (!cancelled && data.spotlight) setSpotlight(data.spotlight);
        }
      } catch {
        // Non-critical
      }
    }
    fetchSpotlight();
    return () => { cancelled = true; };
  }, []);

  // Hide mini spotlight on POS pages or if dismissed
  const showSpotlight = spotlight && !spotlightDismissed && !pathname.includes('/dashboard/pos');

  // Event mode — render children only, no nav chrome
  if (pathname.includes('/event-mode')) {
    return <>{children}</>;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--surface-base)]">
      {/* Tablet sidebar: md–lg */}
      <TabletSidebar />

      {/* Desktop sidebar: lg+ */}
      <DesktopSidebar />

      {/* Main content area */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Phone top bar: below md */}
        <PhoneTopBar onSunnyOpen={openSunny} />

        {/* Trial banner */}
        <TrialBanner />

        {/* Mobile spotlight banner (below md) */}
        {showSpotlight && <SpotlightBanner spotlight={spotlight} onDismiss={() => setSpotlightDismissed(true)} />}

        {/* Desktop/Tablet header bar — Ask Sunny pill (md+) */}
        <div className="hidden md:flex items-center justify-end px-4 lg:px-8 py-2 shrink-0">
          <SunnyPill onClick={openSunny} />
        </div>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          <div className="p-4 lg:p-8 max-w-7xl mx-auto pb-24 md:pb-8">
            {children}
          </div>
        </main>

        {/* Phone bottom nav: below md */}
        <PhoneBottomNav onMoreOpen={openMore} />
      </div>

      {/* More sheet (phone only) */}
      <MoreSheet
        isOpen={isMoreOpen}
        onClose={closeMore}
        onSunnyOpen={openSunny}
      />

      {/* Mentor Chat — controlled externally */}
      <MentorChat isOpen={isSunnyOpen} onClose={closeSunny} />

      {/* Quick Reply Toast — polls for new inbound messages */}
      <QuickReplyToast />
    </div>
  );
}

// ============================================================================
// Hooks
// ============================================================================

function useFilteredItems(items: NavItem[]) {
  const { can } = useTenant();
  return items.filter((item) => {
    if (item.requirePermission && !can(item.requirePermission)) return false;
    return true;
  });
}

function useCrmStatus() {
  const { tenant } = useTenant();
  return getCrmStatus(tenant);
}

function useIsPlatformAdmin() {
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      try {
        const res = await fetch('/api/admin/check');
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) setIsAdmin(data.isAdmin === true);
        }
      } catch {
        // Silently fail
      }
    }
    check();
    return () => { cancelled = true; };
  }, []);

  return isAdmin;
}

function useLogout() {
  const router = useRouter();
  const supabase = createClient();

  return useCallback(async () => {
    await supabase.auth.signOut();
    router.push('/auth/login');
    router.refresh();
  }, [supabase, router]);
}

function useIsActive(href: string) {
  const pathname = usePathname();
  if (href === '/dashboard') return pathname === '/dashboard';
  return pathname.startsWith(href);
}

// ============================================================================
// SunnyPill — shared pill button
// ============================================================================

function SunnyPill({ onClick, collapsed, label }: { onClick: () => void; collapsed?: boolean; label?: string }) {
  if (collapsed) {
    return (
      <button
        onClick={onClick}
        className="w-10 h-10 rounded-full bg-[var(--accent-50)] border border-[var(--accent-200)] text-[var(--accent-700)] flex items-center justify-center hover:bg-[var(--accent-100)] transition-colors"
        title="Ask Sunny"
        aria-label="Open Sunny AI"
      >
        <SparkleIcon className="w-4 h-4" />
      </button>
    );
  }

  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 px-3 h-9 rounded-full bg-[var(--accent-50)] border border-[var(--accent-200)] text-[var(--accent-700)] hover:bg-[var(--accent-100)] transition-colors text-sm font-medium"
      aria-label="Open Sunny AI"
    >
      <SparkleIcon className="w-4 h-4" />
      <span>{label || 'Ask Sunny'}</span>
    </button>
  );
}

// ============================================================================
// PhoneTopBar (below md)
// ============================================================================

function PhoneTopBar({ onSunnyOpen }: { onSunnyOpen: () => void }) {
  const { tenant } = useTenant();

  return (
    <div className="md:hidden flex items-center justify-between px-4 h-14 bg-[var(--surface-base)] border-b border-border-default shrink-0 safe-area-top">
      <div className="flex items-center gap-2.5 min-w-0">
        <TenantLogo size="sm" />
        <div className="text-sm font-bold text-text-primary truncate">
          {tenant?.name || 'Loading...'}
        </div>
      </div>
      <SunnyPill onClick={onSunnyOpen} />
    </div>
  );
}

// ============================================================================
// PhoneBottomNav (below md)
// ============================================================================

function PhoneBottomNav({ onMoreOpen }: { onMoreOpen: () => void }) {
  const pathname = usePathname();
  const unreadCount = useUnreadCount();
  const crmStatus = useCrmStatus();

  return (
    <nav className="md:hidden flex items-end justify-around bg-[var(--surface-base)] border-t border-border-default shrink-0 px-2 safe-area-bottom">
      {/* Home */}
      <PhoneTab href="/dashboard" label="Home" icon={HomeIcon} />

      {/* POS — raised center button */}
      <div className="flex flex-col items-center justify-end pb-1.5 -mt-3">
        <Link
          href="/dashboard/pos"
          className={cn(
            'w-14 h-14 rounded-full flex items-center justify-center shadow-md transition-colors',
            pathname.startsWith('/dashboard/pos')
              ? 'bg-[var(--accent-600)] text-white'
              : 'bg-[var(--accent-500)] text-white'
          )}
          aria-label="POS"
        >
          <POSIcon className="w-6 h-6" />
        </Link>
        <span className={cn(
          'text-[10px] font-medium mt-0.5',
          pathname.startsWith('/dashboard/pos') ? 'text-[var(--accent-600)]' : 'text-text-tertiary'
        )}>
          POS
        </span>
      </div>

      {/* Messages (with unread badge) */}
      <PhoneTab href="/dashboard/messages" label="Messages" icon={MessagesIcon} badge={unreadCount} />

      {/* CRM (with lock if inactive) */}
      <PhoneTab href={crmStatus.active ? '/dashboard/broadcasts' : '#'} label="CRM" icon={BroadcastsIcon} locked={!crmStatus.active} />

      {/* More */}
      <button
        onClick={onMoreOpen}
        className="flex flex-col items-center justify-center gap-0.5 py-2 min-h-[48px] min-w-[48px] text-[10px] font-medium text-text-tertiary transition-colors"
        aria-label="More options"
      >
        <MoreDotsIcon className="w-5 h-5" />
        <span>More</span>
      </button>
    </nav>
  );
}

function PhoneTab({ href, label, icon: Icon, badge, locked }: { href: string; label: string; icon: React.ComponentType<{ className?: string }>; badge?: number; locked?: boolean }) {
  const isActive = useIsActive(href);

  if (locked) {
    return (
      <span className="flex flex-col items-center justify-center gap-0.5 py-2 min-h-[48px] min-w-[48px] text-[10px] font-medium text-text-tertiary opacity-50">
        <span className="relative">
          <Icon className="w-5 h-5" />
          <svg className="absolute -top-0.5 -right-1 w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
          </svg>
        </span>
        <span>{label}</span>
      </span>
    );
  }

  return (
    <Link
      href={href}
      className={cn(
        'flex flex-col items-center justify-center gap-0.5 py-2 min-h-[48px] min-w-[48px] text-[10px] font-medium transition-colors',
        isActive ? 'text-[var(--accent-600)]' : 'text-text-tertiary'
      )}
    >
      <span className="relative">
        <Icon className="w-5 h-5" />
        {badge != null && badge > 0 && (
          <span className="absolute -top-1 -right-1.5 flex items-center justify-center">
            <span className="absolute inline-flex h-3 w-3 rounded-full bg-red-400 opacity-75 animate-ping" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-red-500" />
          </span>
        )}
      </span>
      <span>{label}</span>
    </Link>
  );
}

// ============================================================================
// MoreSheet (phone only, z-50)
// ============================================================================

function MoreSheet({ isOpen, onClose, onSunnyOpen }: { isOpen: boolean; onClose: () => void; onSunnyOpen: () => void }) {
  const pathname = usePathname();
  const { can } = useTenant();
  const isPlatformAdmin = useIsPlatformAdmin();
  const handleLogout = useLogout();

  // Lock body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = ''; };
    }
  }, [isOpen]);

  const filteredMoreItems = moreSheetItems.filter((item) => {
    if (item.requirePermission && !can(item.requirePermission)) return false;
    return true;
  });

  return (
    <>
      {/* Backdrop */}
      <div
        className={cn(
          'fixed inset-0 bg-black/30 z-40 transition-opacity duration-300 md:hidden',
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        )}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sheet */}
      <div
        className={cn(
          'fixed bottom-0 left-0 right-0 z-50 bg-[var(--surface-base)] rounded-t-2xl transition-transform duration-300 ease-out md:hidden safe-area-bottom',
          isOpen ? 'translate-y-0' : 'translate-y-full'
        )}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-10 h-1 rounded-full bg-border-default" />
        </div>

        <div className="px-4 pb-4 space-y-1">
          {/* Nav items */}
          {filteredMoreItems.map((item) => {
            const isActive = item.href === '/dashboard'
              ? pathname === '/dashboard'
              : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={cn(
                  'flex items-center gap-3 px-3 min-h-[48px] rounded-lg text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-[var(--nav-active-bg)] text-[var(--nav-active-text)]'
                    : 'text-text-secondary hover:text-text-primary hover:bg-[var(--surface-raised)]'
                )}
              >
                <item.icon className="w-5 h-5 shrink-0" />
                {item.label}
              </Link>
            );
          })}

          {/* Support — opens Sunny */}
          <button
            onClick={() => { onClose(); onSunnyOpen(); }}
            className="flex items-center gap-3 px-3 min-h-[48px] rounded-lg text-sm font-medium text-text-secondary hover:text-text-primary hover:bg-[var(--surface-raised)] w-full transition-colors"
          >
            <SparkleIcon className="w-5 h-5 shrink-0" />
            Support
          </button>

          {/* Platform Admin */}
          {isPlatformAdmin && (
            <Link
              href="/admin"
              onClick={onClose}
              className="flex items-center gap-3 px-3 min-h-[48px] rounded-lg text-sm font-medium text-warning-600 hover:bg-warning-50 transition-colors"
            >
              <AdminShieldIcon className="w-5 h-5 shrink-0" />
              Platform Admin
            </Link>
          )}

          {/* Divider */}
          <div className="border-t border-border-default my-1" />

          {/* Sign Out */}
          <button
            onClick={() => { onClose(); handleLogout(); }}
            className="flex items-center gap-3 px-3 min-h-[48px] rounded-lg text-sm text-text-tertiary hover:text-text-primary hover:bg-[var(--surface-raised)] w-full transition-colors"
          >
            <LogoutIcon className="w-5 h-5 shrink-0" />
            Sign Out
          </button>
        </div>
      </div>
    </>
  );
}

// ============================================================================
// TabletSidebar (md to lg)
// ============================================================================

function TabletSidebar() {
  const pathname = usePathname();
  const [expanded, setExpanded] = useState(false);
  const { tenant, role } = useTenant();
  const isPlatformAdmin = useIsPlatformAdmin();
  const handleLogout = useLogout();
  const visibleItems = useFilteredItems(sidebarItems);
  const unreadCount = useUnreadCount();
  const crmStatus = useCrmStatus();

  const mainItems = visibleItems.filter(i => !i.group);
  const crmItems = visibleItems.filter(i => i.group === 'CRM');

  const renderTabletItem = (item: NavItem, locked = false) => {
    const isActive = item.href === '/dashboard'
      ? pathname === '/dashboard'
      : pathname.startsWith(item.href);
    return (
      <Link
        key={item.href}
        href={locked ? '#' : item.href}
        onClick={locked ? (e: React.MouseEvent) => e.preventDefault() : undefined}
        title={expanded ? undefined : item.label}
        className={cn(
          'flex items-center gap-3 rounded-lg text-sm font-medium transition-colors min-h-[44px]',
          expanded ? 'px-3' : 'justify-center px-0',
          locked
            ? 'text-text-tertiary opacity-50 cursor-not-allowed'
            : isActive
              ? 'bg-[var(--nav-active-bg)] text-[var(--nav-active-text)]'
              : 'text-text-secondary hover:text-text-primary hover:bg-[var(--surface-raised)]'
        )}
      >
        <span className="relative shrink-0">
          <item.icon className="w-5 h-5" />
          {item.label === 'Messages' && !locked && unreadCount > 0 && (
            <span className="absolute -top-1 -right-1.5 min-w-[16px] h-4 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center px-1">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </span>
        {expanded && <span className="truncate">{item.label}</span>}
      </Link>
    );
  };

  return (
    <aside
      className={cn(
        'hidden md:flex lg:hidden flex-col shrink-0 bg-[var(--surface-sidebar)] border-r border-border-default transition-[width] duration-200 overflow-hidden',
        expanded ? 'w-60' : 'w-16'
      )}
    >
      {/* Toggle */}
      <div className="flex items-center justify-center h-14 border-b border-border-default shrink-0">
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-10 h-10 flex items-center justify-center rounded-lg text-text-secondary hover:text-text-primary hover:bg-[var(--surface-raised)] transition-colors"
          aria-label={expanded ? 'Collapse sidebar' : 'Expand sidebar'}
        >
          {expanded ? <ChevronLeftIcon className="w-5 h-5" /> : <HamburgerIcon className="w-5 h-5" />}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 py-3 space-y-1 overflow-y-auto">
        {mainItems.filter(i => ['Home', 'Events', 'POS', 'Clients', 'Messages'].includes(i.label)).map(item => renderTabletItem(item))}

        {/* CRM section */}
        {crmItems.length > 0 && (
          <div className="pt-2">
            {expanded && (
              <div className="flex items-center justify-between px-3 mb-1">
                <span className="text-[10px] uppercase tracking-wider text-text-tertiary font-semibold">CRM</span>
                {crmStatus.reason === 'trial' && crmStatus.daysLeft != null && crmStatus.daysLeft <= 14 && (
                  <span className="text-[10px] font-medium text-warning-600">{crmStatus.daysLeft}d</span>
                )}
              </div>
            )}
            {crmItems.map(item => renderTabletItem(item, !crmStatus.active))}
          </div>
        )}

        {mainItems.filter(i => !['Home', 'Events', 'POS', 'Clients', 'Messages'].includes(i.label)).map(item => renderTabletItem(item))}
      </nav>

      {/* Footer */}
      <div className={cn('border-t border-border-default py-3 space-y-1', expanded ? 'px-3' : 'px-2')}>
        {/* Platform Admin */}
        {isPlatformAdmin && (
          <Link
            href="/admin"
            title={expanded ? undefined : 'Platform Admin'}
            className={cn(
              'flex items-center gap-3 rounded-lg text-sm font-medium text-warning-600 hover:bg-warning-50 transition-colors min-h-[44px]',
              expanded ? 'px-3' : 'justify-center px-0'
            )}
          >
            <AdminShieldIcon className="w-5 h-5 shrink-0" />
            {expanded && <span>Platform Admin</span>}
          </Link>
        )}

        {/* Sign Out */}
        <button
          onClick={handleLogout}
          title={expanded ? undefined : 'Sign Out'}
          className={cn(
            'flex items-center gap-3 rounded-lg text-sm text-text-tertiary hover:text-text-primary hover:bg-[var(--surface-raised)] w-full transition-colors min-h-[44px]',
            expanded ? 'px-3' : 'justify-center px-0'
          )}
        >
          <LogoutIcon className="w-5 h-5 shrink-0" />
          {expanded && <span>Sign Out</span>}
        </button>
      </div>
    </aside>
  );
}

// ============================================================================
// DesktopSidebar (lg+)
// ============================================================================

function DesktopSidebar() {
  const pathname = usePathname();
  const { tenant, role } = useTenant();
  const isPlatformAdmin = useIsPlatformAdmin();
  const handleLogout = useLogout();
  const visibleItems = useFilteredItems(sidebarItems);
  const unreadCount = useUnreadCount();
  const crmStatus = useCrmStatus();

  // Split items into non-CRM and CRM groups
  const mainItems = visibleItems.filter(i => !i.group);
  const crmItems = visibleItems.filter(i => i.group === 'CRM');

  const renderNavItem = (item: NavItem, locked = false) => {
    const isActive = item.href === '/dashboard'
      ? pathname === '/dashboard'
      : pathname.startsWith(item.href);
    return (
      <Link
        key={item.href}
        href={locked ? '#' : item.href}
        onClick={locked ? (e: React.MouseEvent) => e.preventDefault() : undefined}
        className={cn(
          'flex items-center gap-3 px-3 min-h-[48px] rounded-lg text-sm font-medium transition-colors',
          locked
            ? 'text-text-tertiary opacity-50 cursor-not-allowed'
            : isActive
              ? 'bg-[var(--nav-active-bg)] text-[var(--nav-active-text)] border-l-3 border-[var(--nav-active-border)]'
              : 'text-text-secondary hover:text-text-primary hover:bg-[var(--surface-raised)]'
        )}
      >
        <span className="relative shrink-0">
          <item.icon className="w-5 h-5" />
          {item.label === 'Messages' && !locked && unreadCount > 0 && (
            <span className="absolute -top-1 -right-1.5 min-w-[16px] h-4 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center px-1">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </span>
        {item.label}
        {locked && (
          <svg className="w-3.5 h-3.5 ml-auto shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
          </svg>
        )}
      </Link>
    );
  };

  return (
    <aside className="hidden lg:flex w-64 bg-[var(--surface-sidebar)] border-r border-border-default flex-col shrink-0">
      {/* Brand */}
      <div className="px-5 py-5 border-b border-border-default">
        <div className="flex items-center gap-2.5">
          <TenantLogo size="md" />
          <div className="min-w-0">
            <div className="text-text-primary truncate" style={{ fontSize: 16, fontWeight: 700 }}>{tenant?.name || 'Loading...'}</div>
            <div className="text-text-tertiary truncate" style={{ fontSize: 10, fontWeight: 400 }}>Powered by Sunstone</div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {/* Main nav items (non-CRM) — up through Clients */}
        {mainItems.filter(i => ['Home', 'Events', 'POS', 'Clients', 'Messages'].includes(i.label)).map(item => renderNavItem(item))}

        {/* CRM Group */}
        {crmItems.length > 0 && (
          <div className="pt-3">
            <div className="flex items-center justify-between px-3 mb-1">
              <span className="text-[10px] uppercase tracking-wider text-text-tertiary font-semibold">CRM</span>
              {crmStatus.reason === 'trial' && crmStatus.daysLeft != null && crmStatus.daysLeft <= 14 && (
                <span className="text-[10px] font-medium text-warning-600">
                  {crmStatus.daysLeft}d left
                </span>
              )}
              {!crmStatus.active && (
                <Link href="/dashboard/settings?tab=subscription" className="text-[10px] font-medium text-[var(--accent-600)] hover:underline">
                  Activate
                </Link>
              )}
            </div>
            {crmItems.map(item => renderNavItem(item, !crmStatus.active))}
          </div>
        )}

        {/* Remaining main nav items (Inventory, Gift Cards, Reports, Settings) */}
        {mainItems.filter(i => !['Home', 'Events', 'POS', 'Clients', 'Messages'].includes(i.label)).map(item => renderNavItem(item))}
      </nav>

      {/* Footer */}
      <div className="px-3 py-4 border-t border-border-default space-y-1">
        {/* Platform Admin */}
        {isPlatformAdmin && (
          <Link
            href="/admin"
            className="flex items-center gap-3 px-3 min-h-[48px] rounded-lg text-sm font-medium text-warning-600 hover:bg-warning-50 transition-colors"
          >
            <AdminShieldIcon className="w-5 h-5 shrink-0" />
            <span>Platform Admin</span>
            <span className="ml-auto text-[10px] uppercase tracking-wider bg-warning-100 text-warning-600 px-1.5 py-0.5 rounded font-semibold">
              Admin
            </span>
          </Link>
        )}

        {/* Role indicator */}
        <div className="px-3 mb-1 text-[10px] uppercase tracking-wider text-text-tertiary font-medium">
          {role === 'admin' ? 'Admin' : role === 'manager' ? 'Manager' : 'Staff'}
        </div>
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-3 min-h-[48px] rounded-lg text-sm text-text-tertiary hover:text-text-primary hover:bg-[var(--surface-raised)] w-full transition-colors"
        >
          <LogoutIcon className="w-5 h-5 shrink-0" />
          Sign Out
        </button>
      </div>
    </aside>
  );
}

// ============================================================================
// Trial Expiry Banner (unchanged from v5)
// ============================================================================

function TrialBanner() {
  const { tenant } = useTenant();
  const [dismissed, setDismissed] = useState(false);

  if (!tenant || dismissed) return null;

  const effectiveTier = getSubscriptionTier(tenant);
  const trialActive = isTrialActive(tenant);
  const hasActiveSubscription =
    tenant.subscription_status === 'active' || tenant.subscription_status === 'trialing';

  if (hasActiveSubscription && tenant.subscription_status !== 'trialing') return null;

  // Case 1: Trial still active but running out
  if (trialActive && tenant.trial_ends_at) {
    const trialEnd = new Date(tenant.trial_ends_at);
    const now = new Date();
    const daysRemaining = Math.ceil((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (daysRemaining > 7) return null;

    return (
      <div className="bg-warning-50 border-b border-warning-200 px-4 py-2.5 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2 text-sm text-warning-600">
          <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>
            <span className="font-medium">Your Pro trial ends in {daysRemaining} day{daysRemaining !== 1 ? 's' : ''}.</span>{' '}
            Upgrade to keep full access to reports, AI insights, and team features.
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-4">
          <Link
            href="/dashboard/settings?tab=subscription"
            className="text-sm font-medium text-warning-600 hover:text-warning-600 underline underline-offset-2"
          >
            View Plans
          </Link>
          <button
            onClick={() => setDismissed(true)}
            className="text-warning-400 hover:text-warning-600 p-1"
            aria-label="Dismiss"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    );
  }

  // Case 2: Trial has expired and they're on Starter
  if (!trialActive && effectiveTier === 'starter' && tenant.trial_ends_at) {
    const trialEnd = new Date(tenant.trial_ends_at);
    const now = new Date();
    const daysSinceExpiry = Math.floor((now.getTime() - trialEnd.getTime()) / (1000 * 60 * 60 * 24));

    if (daysSinceExpiry > 30) return null;

    return (
      <div className="bg-[var(--surface-raised)] border-b border-border-default px-4 py-2.5 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2 text-sm text-text-secondary">
          <svg className="w-4 h-4 shrink-0 text-text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
          </svg>
          <span>
            <span className="font-medium text-text-primary">Your Pro trial has ended.</span>{' '}
            Upgrade anytime to unlock reports, AI insights, and more.
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-4">
          <Link
            href="/dashboard/settings?tab=subscription"
            className="text-sm font-medium text-[var(--accent-600)] hover:text-[var(--accent-700)] underline underline-offset-2"
          >
            View Plans
          </Link>
          <button
            onClick={() => setDismissed(true)}
            className="text-text-tertiary hover:text-text-secondary p-1"
            aria-label="Dismiss"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    );
  }

  return null;
}

// ============================================================================
// Tenant Logo (unchanged)
// ============================================================================

function TenantLogo({ size = 'md' }: { size?: 'sm' | 'md' }) {
  const { tenant } = useTenant();
  const [imgError, setImgError] = useState(false);

  const dims = size === 'sm' ? 'w-7 h-7' : 'w-8 h-8';
  const radius = size === 'sm' ? 'rounded-md' : 'rounded-lg';
  const textSize = size === 'sm' ? 'text-sm' : 'text-base';

  if (tenant?.logo_url && !imgError) {
    return (
      <div className={cn(dims, radius, 'relative overflow-hidden shrink-0 bg-[var(--surface-raised)]')}>
        <Image
          src={tenant.logo_url}
          alt={tenant.name || 'Logo'}
          fill
          className="object-contain"
          onError={() => setImgError(true)}
          unoptimized
        />
      </div>
    );
  }

  return (
    <div className={cn(
      dims, radius,
      'bg-gradient-to-br from-[var(--accent-400)] to-[var(--accent-600)] flex items-center justify-center shrink-0 shadow-sm'
    )}>
      <span className={cn('text-white font-bold', textSize)}>
        {tenant?.name?.charAt(0) || 'S'}
      </span>
    </div>
  );
}

// ============================================================================
// Spotlight Mini Components
// ============================================================================

/** Slim inline spotlight banner — shown on all screen sizes above page content */
function SpotlightBanner({ spotlight, onDismiss }: { spotlight: SpotlightMiniData; onDismiss: () => void }) {
  return (
    <div
      className="flex items-center gap-3 shrink-0 border-b border-[var(--border-default)]"
      style={{
        padding: '8px 16px',
        background: 'linear-gradient(90deg, var(--accent-50), var(--surface-base))',
      }}
    >
      <a
        href={spotlight.url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-3 flex-1 min-w-0 hover:opacity-80 transition-opacity"
      >
        {/* Product image */}
        <div
          className="shrink-0 rounded-lg overflow-hidden"
          style={{ width: 36, height: 36, background: 'var(--surface-raised)' }}
        >
          {spotlight.imageUrl ? (
            <img
              src={spotlight.imageUrl}
              alt={spotlight.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <SunstoneLogoIcon className="w-4 h-4 text-[var(--accent-500)]" />
            </div>
          )}
        </div>

        {/* Text */}
        <div className="flex-1 min-w-0">
          <p
            className="text-[var(--text-primary)] truncate"
            style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.3 }}
          >
            {spotlight.title}
          </p>
          <p className="text-[var(--text-tertiary)]" style={{ fontSize: 10 }}>
            {spotlight.badge}{spotlight.price ? ` · ${spotlight.price}` : ''}
          </p>
        </div>

        {/* Arrow */}
        <svg
          className="w-4 h-4 text-[var(--accent-500)] shrink-0"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </a>

      {/* Dismiss button */}
      <button
        onClick={onDismiss}
        className="shrink-0 p-1 rounded hover:bg-[var(--surface-subtle)] transition-colors"
        aria-label="Dismiss"
      >
        <svg className="w-3.5 h-3.5 text-[var(--text-tertiary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

// ============================================================================
// Icons
// ============================================================================

function HomeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
    </svg>
  );
}

function EventsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
    </svg>
  );
}

function POSIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007zM8.625 10.5a.375.375 0 11-.75 0 .375.375 0 01.75 0zm7.5 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
    </svg>
  );
}

function ClientsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
    </svg>
  );
}

function BroadcastsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.34 15.84c-.688-.06-1.386-.09-2.09-.09H7.5a4.5 4.5 0 110-9h.75c.704 0 1.402-.03 2.09-.09m0 9.18c.253.962.584 1.892.985 2.783.247.55.06 1.21-.463 1.511l-.657.38c-.551.318-1.26.117-1.527-.461a20.845 20.845 0 01-1.44-4.282m3.102.069a18.03 18.03 0 01-.59-4.59c0-1.586.205-3.124.59-4.59m0 9.18a23.848 23.848 0 018.835 2.535M10.34 6.66a23.847 23.847 0 008.835-2.535m0 0A23.74 23.74 0 0018.795 3m.38 1.125a23.91 23.91 0 011.014 5.395m-1.014 8.855c-.118.38-.245.754-.38 1.125m.38-1.125a23.91 23.91 0 001.014-5.395m0-3.46c.495.413.811 1.035.811 1.73 0 .695-.316 1.317-.811 1.73m0-3.46a24.347 24.347 0 010 3.46" />
    </svg>
  );
}

function WorkflowsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" />
    </svg>
  );
}

function InventoryIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
    </svg>
  );
}

function GiftCardIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 11.25v8.25a1.5 1.5 0 01-1.5 1.5H5.25a1.5 1.5 0 01-1.5-1.5v-8.25M12 4.875A2.625 2.625 0 109.375 7.5H12m0-2.625V7.5m0-2.625A2.625 2.625 0 1114.625 7.5H12m0 0V21m-8.625-9.75h18c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125h-18c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
    </svg>
  );
}

function ReportsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
    </svg>
  );
}

function SettingsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function SparkleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 2L14.09 8.26L20 9.27L15.55 13.97L16.91 20L12 16.9L7.09 20L8.45 13.97L4 9.27L9.91 8.26L12 2Z" />
    </svg>
  );
}

function MoreDotsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0zM12.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0zM18.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
    </svg>
  );
}

function ChevronLeftIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
    </svg>
  );
}

function HamburgerIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5" />
    </svg>
  );
}

function LogoutIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
    </svg>
  );
}

function SunstoneLogoIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 2L14.09 8.26L20 9.27L15.55 13.97L16.91 20L12 16.9L7.09 20L8.45 13.97L4 9.27L9.91 8.26L12 2Z" />
    </svg>
  );
}

function AdminShieldIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
    </svg>
  );
}

function MessagesIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 01-.825-.242m9.345-8.334a2.126 2.126 0 00-.476-.095 48.64 48.64 0 00-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0011.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155" />
    </svg>
  );
}
