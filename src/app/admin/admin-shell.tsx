// ============================================================================
// Admin Shell v5 — src/app/admin/admin-shell.tsx
// ============================================================================
// v5: Obsidian + Sunstone Fire fixed theme, sidebar-only nav (no bottom tabs),
//     mobile hamburger opens sidebar drawer overlay, Atlas pill in header
// ============================================================================

'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import AdminAIChat from '@/components/AdminAIChat';

// ============================================================================
// Obsidian Theme — fixed CSS custom properties (never changes)
// ============================================================================

const OBSIDIAN_VARS: Record<string, string> = {
  '--surface-default': '#18181F',
  '--surface-base': '#0F0F12',
  '--surface-raised': '#1F1F28',
  '--surface-overlay': '#1F1F28',
  '--surface-subtle': '#1A1A24',
  '--surface-sidebar': '#18181F',
  '--accent-primary': '#FF7A00',
  '--accent-hover': '#E86E00',
  '--accent-muted': 'rgba(255, 122, 0, 0.12)',
  '--accent-50': 'rgba(255, 122, 0, 0.08)',
  '--accent-100': 'rgba(255, 122, 0, 0.15)',
  '--accent-200': 'rgba(255, 122, 0, 0.25)',
  '--accent-400': '#FF9A40',
  '--accent-500': '#FF7A00',
  '--accent-600': '#E86E00',
  '--accent-700': '#CC6000',
  '--text-primary': '#E8E4DF',
  '--text-secondary': '#9B9590',
  '--text-tertiary': '#6B6560',
  '--text-on-accent': '#FFFFFF',
  '--border-default': '#2A2A35',
  '--border-subtle': '#222230',
  '--border-strong': '#3A3A48',
  '--shadow-card': '0 4px 12px rgba(0,0,0,0.3)',
  '--nav-active-bg': 'rgba(255, 122, 0, 0.12)',
  '--nav-active-text': '#FF7A00',
  '--nav-active-border': '#FF7A00',
  '--font-display': 'Georgia',
};

// ============================================================================
// Role hierarchy for nav filtering
// ============================================================================

const ROLE_LEVEL: Record<string, number> = {
  super_admin: 4,
  admin: 3,
  marketing: 2,
  support: 2,
  viewer: 1,
};

// ============================================================================
// Nav Items (6 tabs — Team visible only to super_admin)
// ============================================================================

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  exact?: boolean;
  badge?: boolean;
  requiredRole?: string;
  /** Roles explicitly denied access even if their level is sufficient */
  denyRoles?: string[];
  /** Roles explicitly granted access regardless of level-based checks */
  allowRoles?: string[];
}

const allNavItems: NavItem[] = [
  { href: '/admin', label: 'Overview', icon: OverviewIcon, exact: true },
  { href: '/admin/tenants', label: 'Tenants', icon: TenantsIcon },
  { href: '/admin/revenue', label: 'Revenue', icon: RevenueIcon, requiredRole: 'admin', allowRoles: ['marketing'] },
  { href: '/admin/costs', label: 'Costs', icon: CostsIcon, requiredRole: 'admin' },
  { href: '/admin/usage', label: 'Usage', icon: UsageIcon, requiredRole: 'admin', allowRoles: ['marketing'] },
  { href: '/admin/spotlight', label: 'Spotlight', icon: SpotlightIcon, requiredRole: 'admin', allowRoles: ['marketing'] },
  { href: '/admin/catalog', label: 'Catalog', icon: CatalogIcon, requiredRole: 'admin', allowRoles: ['marketing'] },
  { href: '/admin/ambassadors', label: 'Ambassadors', icon: AmbassadorsIcon, requiredRole: 'admin', allowRoles: ['marketing'] },
  { href: '/admin/mentor', label: 'Learning', icon: SunnyIcon, badge: true, denyRoles: ['marketing'] },
  { href: '/admin/team', label: 'Team', icon: TeamIcon, requiredRole: 'super_admin' },
];

function filterNavByRole(items: NavItem[], role: string): NavItem[] {
  const userLevel = ROLE_LEVEL[role] ?? 0;
  return items.filter(item => {
    // Explicit deny takes priority
    if (item.denyRoles?.includes(role)) return false;
    // Explicit allow bypasses level check
    if (item.allowRoles?.includes(role)) return true;
    if (!item.requiredRole) return true;
    return userLevel >= (ROLE_LEVEL[item.requiredRole] ?? 0);
  });
}

// ============================================================================
// Shell
// ============================================================================

export function AdminShell({
  userEmail,
  adminRole = 'super_admin',
  children,
}: {
  userEmail: string;
  adminRole?: string;
  children: React.ReactNode;
}) {
  const [isAtlasOpen, setIsAtlasOpen] = useState(false);
  const openAtlas = useCallback(() => setIsAtlasOpen(true), []);
  const closeAtlas = useCallback(() => setIsAtlasOpen(false), []);

  return (
    <div
      className="flex h-screen overflow-hidden"
      style={{ ...OBSIDIAN_VARS, backgroundColor: '#0F0F12' } as React.CSSProperties}
    >
      {/* Desktop Sidebar */}
      <DesktopSidebar userEmail={userEmail} adminRole={adminRole} />

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Mobile header with hamburger drawer */}
        <MobileHeader onAtlasOpen={openAtlas} userEmail={userEmail} adminRole={adminRole} />

        {/* Desktop header with Atlas pill */}
        <div className="hidden lg:flex items-center justify-end px-8 py-2 shrink-0">
          <AtlasPill onClick={openAtlas} />
        </div>

        <main className="flex-1 overflow-y-auto">
          <div className="p-4 lg:p-8 max-w-7xl mx-auto pb-8">
            {children}
          </div>
        </main>
      </div>

      {/* Atlas AI Chat — controlled externally */}
      <AdminAIChat isOpen={isAtlasOpen} onClose={closeAtlas} />
    </div>
  );
}

// ============================================================================
// Atlas Pill — header button
// ============================================================================

function AtlasPill({ onClick, compact }: { onClick: () => void; compact?: boolean }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 px-3 h-9 rounded-full transition-colors text-sm font-medium"
      style={{
        backgroundColor: 'rgba(255, 122, 0, 0.15)',
        color: '#FF7A00',
      }}
      aria-label="Open Atlas AI"
    >
      <AtlasIconSmall className="w-4 h-4" />
      <span>{compact ? 'Atlas' : 'Ask Atlas'}</span>
    </button>
  );
}

// ============================================================================
// Hook: Pending gap count for badge
// ============================================================================

function usePendingGapCount() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    async function fetchCount() {
      try {
        const res = await fetch('/api/admin/mentor/gaps?status=pending&limit=1');
        if (res.ok) {
          const data = await res.json();
          setCount(data.stats?.pendingGaps || 0);
        }
      } catch {
        // Silently fail
      }
    }
    fetchCount();
  }, []);

  return count;
}

// ============================================================================
// Desktop Sidebar — Obsidian styled
// ============================================================================

function DesktopSidebar({ userEmail, adminRole }: { userEmail: string; adminRole: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const pendingGapCount = usePendingGapCount();
  const navItems = filterNavByRole(allNavItems, adminRole);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/auth/login');
    router.refresh();
  };

  return (
    <aside
      className="hidden lg:flex w-64 flex-col shrink-0"
      style={{ backgroundColor: '#18181F', borderRight: '1px solid #2A2A35' }}
    >
      {/* Brand */}
      <div className="px-5 py-5" style={{ borderBottom: '1px solid #2A2A35' }}>
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
            style={{ backgroundColor: '#FF7A00' }}
          >
            <span className="text-white font-bold text-sm">S</span>
          </div>
          <div className="min-w-0">
            <div className="text-sm font-bold truncate" style={{ color: '#E8E4DF' }}>Sunstone Admin</div>
            <div className="text-xs truncate" style={{ color: '#6B6560' }}>{userEmail}</div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = item.exact
            ? pathname === item.href
            : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 min-h-[44px] rounded-lg text-sm font-medium transition-colors',
                isActive
                  ? 'border-l-[3px]'
                  : 'hover:bg-[rgba(255,255,255,0.04)]'
              )}
              style={{
                color: isActive ? '#FF7A00' : '#6B6560',
                backgroundColor: isActive ? 'rgba(255, 122, 0, 0.12)' : undefined,
                borderColor: isActive ? '#FF7A00' : 'transparent',
              }}
            >
              <item.icon className="w-5 h-5 shrink-0" />
              <span className="flex-1">{item.label}</span>
              {item.badge && pendingGapCount > 0 && (
                <span
                  className="px-2 py-0.5 text-[10px] font-bold rounded-full min-w-[20px] text-center"
                  style={{ backgroundColor: '#FF7A00', color: '#FFFFFF' }}
                >
                  {pendingGapCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-3 py-4 space-y-1" style={{ borderTop: '1px solid #2A2A35' }}>
        <Link
          href="/dashboard"
          className="flex items-center gap-3 px-3 min-h-[44px] rounded-lg text-sm transition-colors hover:bg-[rgba(255,255,255,0.04)]"
          style={{ color: '#9B9590' }}
        >
          <BackIcon className="w-5 h-5 shrink-0" />
          Back to Dashboard
        </Link>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 min-h-[44px] rounded-lg text-sm transition-colors hover:bg-[rgba(255,255,255,0.04)]"
          style={{ color: '#9B9590' }}
        >
          <LogoutIcon className="w-5 h-5 shrink-0" />
          Sign Out
        </button>
      </div>
    </aside>
  );
}

// ============================================================================
// Mobile Header — with Atlas pill
// ============================================================================

function MobileHeader({ onAtlasOpen, userEmail, adminRole }: { onAtlasOpen: () => void; userEmail: string; adminRole: string }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const pendingGapCount = usePendingGapCount();
  const navItems = filterNavByRole(allNavItems, adminRole);

  // Close drawer on route change
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/auth/login');
    router.refresh();
  };

  return (
    <>
      <div
        className="lg:hidden flex items-center justify-between px-4 h-14 shrink-0"
        style={{ backgroundColor: '#18181F', borderBottom: '1px solid #2A2A35' }}
      >
        <div className="flex items-center gap-2.5">
          {/* Hamburger button */}
          <button
            onClick={() => setDrawerOpen(true)}
            className="w-9 h-9 rounded-lg flex items-center justify-center transition-colors -ml-1"
            style={{ backgroundColor: drawerOpen ? 'rgba(255, 122, 0, 0.12)' : 'transparent' }}
            aria-label="Open navigation"
          >
            <HamburgerIcon className="w-5 h-5" style={{ color: '#FF7A00' }} />
          </button>
          <div className="text-sm font-bold" style={{ color: '#E8E4DF' }}>Sunstone Admin</div>
        </div>
        <AtlasPill onClick={onAtlasOpen} compact />
      </div>

      {/* Sidebar drawer overlay */}
      {drawerOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setDrawerOpen(false)}
          />
          {/* Drawer */}
          <aside
            className="relative w-72 max-w-[85vw] flex flex-col h-full"
            style={{ backgroundColor: '#18181F', borderRight: '1px solid #2A2A35' }}
          >
            {/* Brand + close */}
            <div className="px-5 py-5 flex items-center justify-between" style={{ borderBottom: '1px solid #2A2A35' }}>
              <div className="flex items-center gap-3">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                  style={{ backgroundColor: '#FF7A00' }}
                >
                  <span className="text-white font-bold text-sm">S</span>
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-bold truncate" style={{ color: '#E8E4DF' }}>Sunstone Admin</div>
                  <div className="text-xs truncate" style={{ color: '#6B6560' }}>{userEmail}</div>
                </div>
              </div>
              <button
                onClick={() => setDrawerOpen(false)}
                className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-[rgba(255,255,255,0.06)]"
                aria-label="Close navigation"
              >
                <CloseIcon className="w-5 h-5" style={{ color: '#9B9590' }} />
              </button>
            </div>

            {/* Navigation */}
            <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
              {navItems.map((item) => {
                const isActive = item.exact
                  ? pathname === item.href
                  : pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'flex items-center gap-3 px-3 min-h-[48px] rounded-lg text-sm font-medium transition-colors',
                      isActive
                        ? 'border-l-[3px]'
                        : 'hover:bg-[rgba(255,255,255,0.04)]'
                    )}
                    style={{
                      color: isActive ? '#FF7A00' : '#6B6560',
                      backgroundColor: isActive ? 'rgba(255, 122, 0, 0.12)' : undefined,
                      borderColor: isActive ? '#FF7A00' : 'transparent',
                    }}
                  >
                    <item.icon className="w-5 h-5 shrink-0" />
                    <span className="flex-1">{item.label}</span>
                    {item.badge && pendingGapCount > 0 && (
                      <span
                        className="px-2 py-0.5 text-[10px] font-bold rounded-full min-w-[20px] text-center"
                        style={{ backgroundColor: '#FF7A00', color: '#FFFFFF' }}
                      >
                        {pendingGapCount}
                      </span>
                    )}
                  </Link>
                );
              })}
            </nav>

            {/* Footer */}
            <div className="px-3 py-4 space-y-1" style={{ borderTop: '1px solid #2A2A35' }}>
              <Link
                href="/dashboard"
                className="flex items-center gap-3 px-3 min-h-[48px] rounded-lg text-sm transition-colors hover:bg-[rgba(255,255,255,0.04)]"
                style={{ color: '#9B9590' }}
              >
                <BackIcon className="w-5 h-5 shrink-0" />
                Back to Dashboard
              </Link>
              <button
                onClick={handleSignOut}
                className="w-full flex items-center gap-3 px-3 min-h-[48px] rounded-lg text-sm transition-colors hover:bg-[rgba(255,255,255,0.04)]"
                style={{ color: '#9B9590' }}
              >
                <LogoutIcon className="w-5 h-5 shrink-0" />
                Sign Out
              </button>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}

// ============================================================================
// Icons (inline SVG)
// ============================================================================

function TeamIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
    </svg>
  );
}

function OverviewIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
    </svg>
  );
}

function TenantsIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
    </svg>
  );
}

function RevenueIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function SunnyIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
    </svg>
  );
}

function CostsIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
    </svg>
  );
}

function UsageIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
    </svg>
  );
}

function SpotlightIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
    </svg>
  );
}

function AmbassadorsIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 11.25v8.25a1.5 1.5 0 01-1.5 1.5H5.25a1.5 1.5 0 01-1.5-1.5v-8.25M12 4.875A2.625 2.625 0 109.375 7.5H12m0-2.625V7.5m0-2.625A2.625 2.625 0 1114.625 7.5H12m0 0V21m-8.625-9.75h18c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125h-18c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
    </svg>
  );
}

function CatalogIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007zM8.625 10.5a.375.375 0 11-.75 0 .375.375 0 01.75 0zm7.5 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
    </svg>
  );
}

function BackIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
    </svg>
  );
}

function LogoutIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
    </svg>
  );
}

function AtlasIconSmall({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.5 2v7.5c0 .828.672 1.5 1.5 1.5h1.5M2.5 2H1.5m1 0h11m0 0h1m-1 0v7.5c0 .828-.672 1.5-1.5 1.5h-1.5m-5 0h5m-5 0l-.667 2m5.667-2l.667 2M6 7.5v1M8 6v2.5m2-4v4" />
    </svg>
  );
}

function HamburgerIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
    </svg>
  );
}

function CloseIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}
