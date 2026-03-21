// ============================================================================
// Tenant Context + Hook — src/hooks/use-tenant.tsx
// ============================================================================
// Provides tenant + membership context across the app.
// On login: auto-accepts any pending team invites matching the user's email.
// Exposes: tenant, membership, isLoading, isAdmin, isOwner, role, can(), refetch
// ============================================================================

'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react';
import { createClient } from '@/lib/supabase/client';
import { hasPermission, type Permission, type TenantRole } from '@/lib/permissions';
import type { Tenant, TenantMember } from '@/types';

interface TenantContextValue {
  tenant: Tenant | null;
  membership: TenantMember | null;
  isLoading: boolean;
  isAdmin: boolean;
  isOwner: boolean;
  role: TenantRole | null;
  can: (permission: Permission) => boolean;
  refetch: () => Promise<void>;
}

const TenantContext = createContext<TenantContextValue>({
  tenant: null,
  membership: null,
  isLoading: true,
  isAdmin: false,
  isOwner: false,
  role: null,
  can: () => false,
  refetch: async () => {},
});

export function TenantProvider({ children }: { children: ReactNode }) {
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [membership, setMembership] = useState<TenantMember | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  // Stable reference — prevents dependency cycles in effects
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const supabase = useMemo(() => createClient(), []);

  const fetchTenant = useCallback(async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setIsLoading(false);
        return;
      }

      // ── Try to accept any pending invites first ──────────────────────
      // Fire-and-forget — don't block the main load on this
      try {
        fetch('/api/team/accept', { method: 'POST' }).catch(() => {});
      } catch {
        // Silently fail — if the route doesn't exist or errors, no harm
      }

      // ── Look for existing membership ────────────────────────────────
      const { data: memberData } = await supabase
        .from('tenant_members')
        .select('*, tenants(*)')
        .eq('user_id', user.id)
        .not('accepted_at', 'is', null)
        .limit(1)
        .single();

      if (memberData) {
        setMembership(memberData as unknown as TenantMember);
        setTenant((memberData as any).tenants as Tenant);
        setIsLoading(false);
        return;
      }

      // ── Maybe the accept just ran — retry once after a short delay ──
      await new Promise((resolve) => setTimeout(resolve, 500));
      const { data: retryData } = await supabase
        .from('tenant_members')
        .select('*, tenants(*)')
        .eq('user_id', user.id)
        .not('accepted_at', 'is', null)
        .limit(1)
        .single();

      if (retryData) {
        setMembership(retryData as unknown as TenantMember);
        setTenant((retryData as any).tenants as Tenant);
        setIsLoading(false);
        return;
      }

      // ── Fallback: check if user owns a tenant directly ──────────────
      const { data: ownedTenant } = await supabase
        .from('tenants')
        .select('*')
        .eq('owner_id', user.id)
        .limit(1)
        .single();

      if (ownedTenant) {
        setTenant(ownedTenant as Tenant);
      }
    } catch (err) {
      console.error('Failed to fetch tenant:', err);
    } finally {
      setIsLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    fetchTenant();
  }, [fetchTenant]);

  // ── Derived values ────────────────────────────────────────────────────
  const isOwner = !!(tenant && membership && tenant.owner_id === membership.user_id)
    || !!(tenant && !membership); // owner without a membership row
  const role: TenantRole | null = isOwner
    ? 'admin'
    : (membership?.role as TenantRole) || null;
  const isAdmin = isOwner || role === 'admin';

  const can = useCallback(
    (permission: Permission): boolean => {
      if (isOwner) return true; // owners can do everything
      if (!role) return false;
      return hasPermission(role, permission);
    },
    [isOwner, role]
  );

  // Memoize context value to prevent cascading re-renders of all consumers
  const contextValue = useMemo(() => ({
    tenant,
    membership,
    isLoading,
    isAdmin,
    isOwner,
    role,
    can,
    refetch: fetchTenant,
  }), [tenant, membership, isLoading, isAdmin, isOwner, role, can, fetchTenant]);

  return (
    <TenantContext.Provider value={contextValue}>
      {children}
    </TenantContext.Provider>
  );
}

export const useTenant = () => useContext(TenantContext);