// ============================================================================
// TapToPaySplashTrigger — Auto-shows splash for eligible tenants
// ============================================================================
// Checks: native app + processor connected + splash not shown + admin/owner.
// Renders the TapToPaySplash modal when all conditions are met.
// ============================================================================

'use client';

import { useState, useEffect } from 'react';
import { useTenant } from '@/hooks/use-tenant';
import { isNativeApp } from '@/lib/native';
import { createClient } from '@/lib/supabase/client';
import TapToPaySplash from '@/components/TapToPaySplash';
import { useRouter } from 'next/navigation';

export default function TapToPaySplashTrigger() {
  const { tenant, isOwner, can } = useTenant();
  const router = useRouter();
  const [show, setShow] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (checked) return;
    if (!tenant) return;

    // Only in native app
    if (!isNativeApp()) { setChecked(true); return; }

    // Only for admin/owner
    if (!isOwner && !can('settings:manage')) { setChecked(true); return; }

    // Must have a processor connected
    const hasProcessor = !!tenant.stripe_account_id || !!tenant.square_merchant_id;
    if (!hasProcessor) { setChecked(true); return; }

    // Splash already shown
    if ((tenant as any).tap_to_pay_splash_shown) { setChecked(true); return; }

    // Show the splash
    setShow(true);
    setChecked(true);
  }, [tenant, isOwner, can, checked]);

  if (!show) return null;

  const handleSetUpNow = async () => {
    // Dismiss splash + navigate to settings tap_to_pay section
    const supabase = createClient();
    if (tenant) {
      await supabase
        .from('tenants')
        .update({ tap_to_pay_splash_shown: true })
        .eq('id', tenant.id);
    }
    setShow(false);
    router.push('/dashboard/settings?section=tap_to_pay');
  };

  const handleDismiss = async () => {
    const supabase = createClient();
    if (tenant) {
      await supabase
        .from('tenants')
        .update({ tap_to_pay_splash_shown: true })
        .eq('id', tenant.id);
    }
    setShow(false);
  };

  return (
    <TapToPaySplash onSetUpNow={handleSetUpNow} onDismiss={handleDismiss} />
  );
}
