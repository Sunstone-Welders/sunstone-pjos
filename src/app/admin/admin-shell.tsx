// ============================================================================
// Admin Shell v4 — src/app/admin/admin-shell.tsx
// ============================================================================
// v4: Obsidian + Sunstone Fire fixed theme, bottom tab nav (mobile),
//     updated desktop sidebar, Atlas pill in header (not floating)
// ============================================================================

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
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
}

const allNavItems: NavItem[] = [
  { href: '/admin', label: 'Overview', icon: OverviewIcon, exact: true },
  { href: '/admin/tenants', label: 'Tenants', icon: TenantsIcon },
  { href: '/admin/revenue', label: 'Revenue', icon: RevenueIcon, requiredRole: 'admin' },
  { href: '/admin/costs', label: 'Costs', icon: CostsIcon, requiredRole: 'admin' },
  { href: '/admin/spotlight', label: 'Spotlight', icon: SpotlightIcon, requiredRole: 'admin' },
  { href: '/admin/catalog', label: 'Catalog', icon: CatalogIcon, requiredRole: 'admin' },
  { href: '/admin/mentor', label: 'Learning', icon: SunnyIcon, badge: true },
  { href: '/admin/team', label: 'Team', icon: TeamIcon, requiredRole: 'super_admin' },
];

function filterNavByRole(items: NavItem[], role: string): NavItem[] {
  const userLevel = ROLE_LEVEL[role] ?? 0;
  return items.filter(item => {
    if (!item.requiredRole) return true;
    return userLevel >= (ROLE_LEVEL[item.requiredRole] ?? 0);
  });
}

// Bottom tab layout is derived from allNavItems at render time, filtered by role

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
        {/* Mobile header with Atlas pill */}
        <MobileHeader onAtlasOpen={openAtlas} />

        {/* Desktop header with Atlas pill */}
        <div className="hidden lg:flex items-center justify-end px-8 py-2 shrink-0">
          <AtlasPill onClick={openAtlas} />
        </div>

        <main className="flex-1 overflow-y-auto">
          <div className="p-4 lg:p-8 max-w-7xl mx-auto pb-24 lg:pb-8">
            {children}
          </div>
        </main>

        {/* Mobile bottom nav */}
        <PhoneBottomNav adminRole={adminRole} />
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

function MobileHeader({ onAtlasOpen }: { onAtlasOpen: () => void }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const supabase = createClient();

  // Close on outside click
  useEffect(() => {
    if (!menuOpen) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [menuOpen]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/auth/login');
    router.refresh();
  };

  return (
    <div
      className="lg:hidden flex items-center justify-between px-4 h-14 shrink-0"
      style={{ backgroundColor: '#18181F', borderBottom: '1px solid #2A2A35' }}
    >
      <div className="flex items-center gap-2.5">
        <div
          className="w-7 h-7 rounded-md flex items-center justify-center"
          style={{ backgroundColor: '#FF7A00' }}
        >
          <span className="text-white font-bold text-xs">S</span>
        </div>
        <div className="text-sm font-bold" style={{ color: '#E8E4DF' }}>Sunstone Admin</div>
      </div>
      <div className="flex items-center gap-2">
        <AtlasPill onClick={onAtlasOpen} compact />
        {/* Menu button */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="w-9 h-9 rounded-lg flex items-center justify-center transition-colors"
            style={{ backgroundColor: menuOpen ? 'rgba(255, 122, 0, 0.12)' : 'transparent' }}
            aria-label="Menu"
          >
            <MobileMenuIcon className="w-5 h-5" style={{ color: '#FF7A00' }} />
          </button>
          {menuOpen && (
            <div
              className="absolute right-0 top-full mt-2 w-52 py-1 z-50"
              style={{
                backgroundColor: '#1F1F28',
                border: '1px solid #2A2A35',
                borderRadius: 12,
                boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
              }}
            >
              <a
                href="/dashboard"
                className="flex items-center gap-3 px-4 transition-colors hover:bg-[rgba(255,255,255,0.04)]"
                style={{ color: '#E8E4DF', height: 44 }}
              >
                <BackIcon className="w-4 h-4" style={{ color: '#FF7A00' }} />
                <span className="text-sm">Tenant Dashboard</span>
              </a>
              <button
                onClick={handleSignOut}
                className="w-full flex items-center gap-3 px-4 transition-colors hover:bg-[rgba(255,255,255,0.04)]"
                style={{ color: '#E8E4DF', height: 44 }}
              >
                <LogoutIcon className="w-4 h-4" style={{ color: '#FF7A00' }} />
                <span className="text-sm">Sign Out</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Phone Bottom Nav — 5 tabs with center Overview button
// ============================================================================

function PhoneBottomNav({ adminRole }: { adminRole: string }) {
  const pathname = usePathname();
  const pendingGapCount = usePendingGapCount();

  const isOverviewActive = pathname === '/admin';

  // Filter bottom tabs by role (exclude Overview — it's the center button)
  const filteredItems = filterNavByRole(allNavItems, adminRole).filter(
    item => item.href !== '/admin' && item.href !== '/admin/team'
  );
  // Split into left (before center) and right (after center)
  const leftTabs = filteredItems.slice(0, 2);
  const rightTabs = filteredItems.slice(2);

  return (
    <nav
      className="lg:hidden flex items-end justify-around shrink-0 px-2"
      style={{ backgroundColor: '#18181F', borderTop: '1px solid #2A2A35' }}
    >
      {leftTabs.map(item => (
        <div key={item.href} className="relative">
          <BottomTab href={item.href} label={item.label} icon={item.icon} />
          {item.badge && pendingGapCount > 0 && (
            <span
              className="absolute -top-0.5 right-1 px-1 min-w-[14px] h-[14px] text-[8px] font-bold rounded-full flex items-center justify-center"
              style={{ backgroundColor: '#FF7A00', color: '#FFFFFF' }}
            >
              {pendingGapCount}
            </span>
          )}
        </div>
      ))}

      {/* Overview — raised center button */}
      <div className="flex flex-col items-center justify-end pb-1.5 -mt-3">
        <Link
          href="/admin"
          className="w-12 h-12 rounded-full flex items-center justify-center"
          style={{
            backgroundColor: '#FF7A00',
            boxShadow: '0 4px 14px rgba(255, 122, 0, 0.35)',
          }}
          aria-label="Overview"
        >
          <OverviewIcon className="w-6 h-6 text-white" />
        </Link>
        <span
          className="text-[9px] font-semibold mt-0.5"
          style={{ color: isOverviewActive ? '#FF7A00' : '#6B6560' }}
        >
          Overview
        </span>
      </div>

      {rightTabs.map(item => (
        <div key={item.href} className="relative">
          <BottomTab href={item.href} label={item.label} icon={item.icon} />
          {item.badge && pendingGapCount > 0 && (
            <span
              className="absolute -top-0.5 right-1 px-1 min-w-[14px] h-[14px] text-[8px] font-bold rounded-full flex items-center justify-center"
              style={{ backgroundColor: '#FF7A00', color: '#FFFFFF' }}
            >
              {pendingGapCount}
            </span>
          )}
        </div>
      ))}
    </nav>
  );
}

function BottomTab({
  href,
  label,
  icon: Icon,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
}) {
  const pathname = usePathname();
  const isActive = href === '/admin' ? pathname === '/admin' : pathname.startsWith(href);

  return (
    <Link
      href={href}
      className="flex flex-col items-center justify-center gap-0.5 py-2 min-h-[48px] min-w-[48px]"
    >
      <Icon className="w-5 h-5" style={{ color: isActive ? '#FF7A00' : '#6B6560' }} />
      <span
        className="text-[9px] font-semibold"
        style={{ color: isActive ? '#FF7A00' : '#6B6560' }}
      >
        {label}
      </span>
    </Link>
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

function SpotlightIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
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

function MobileMenuIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 12.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 18.75a.75.75 0 110-1.5.75.75 0 010 1.5z" />
    </svg>
  );
}
