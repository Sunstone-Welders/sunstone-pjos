// src/components/DemoBanner.tsx
// Fixed amber banner shown when logged in as a demo account

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTenant } from '@/hooks/use-tenant';
import { getPersonaKey, PERSONAS } from '@/lib/demo/personas';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';

export default function DemoBanner() {
  const { tenant } = useTenant();
  const router = useRouter();
  const [resetting, setResetting] = useState(false);
  const [switching, setSwitching] = useState(false);

  if (!tenant) return null;

  const personaKey = getPersonaKey(tenant.id);
  if (!personaKey) return null;

  const persona = PERSONAS[personaKey];

  async function handleSwitch() {
    setSwitching(true);
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      router.push('/demo');
      router.refresh();
    } catch (err) {
      console.error('Demo switch failed:', err);
      setSwitching(false);
    }
  }

  async function handleReset() {
    if (!window.confirm('Reset all demo data? This will restore the original sample data for this account.')) {
      return;
    }

    setResetting(true);
    try {
      const res = await fetch('/api/demo/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId: tenant!.id }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Reset failed');
      }

      toast.success('Demo data restored');
      window.location.reload();
    } catch (err: any) {
      toast.error(err.message || 'Failed to reset demo data');
    } finally {
      setResetting(false);
    }
  }

  return (
    <div className="shrink-0 flex items-center justify-between px-4 h-9 bg-amber-500 text-white text-sm font-medium z-50">
      {/* Left: Switch Demo */}
      <button
        onClick={handleSwitch}
        disabled={switching || resetting}
        className="px-3 py-1 rounded text-xs font-semibold bg-white/20 hover:bg-white/30 transition-colors disabled:opacity-50 flex items-center gap-1"
      >
        {switching ? 'Switching...' : '\u2190 Switch Demo'}
      </button>

      {/* Center: label */}
      <span>DEMO MODE — {persona.name}</span>

      {/* Right: Reset */}
      <button
        onClick={handleReset}
        disabled={resetting || switching}
        className="px-3 py-1 rounded text-xs font-semibold bg-white/20 hover:bg-white/30 transition-colors disabled:opacity-50"
      >
        {resetting ? 'Resetting...' : 'Reset Demo Data'}
      </button>
    </div>
  );
}
