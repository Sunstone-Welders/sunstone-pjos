// ============================================================================
// Admin Suspend Ambassador — POST /api/admin/ambassadors/suspend
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { verifyPlatformAdmin, AdminAuthError } from '@/lib/admin/verify-platform-admin';

export async function POST(request: NextRequest) {
  try {
    await verifyPlatformAdmin();
    const { ambassadorId, reason } = await request.json();

    if (!ambassadorId) {
      return NextResponse.json({ error: 'ambassadorId required' }, { status: 400 });
    }

    const supabase = await createServiceRoleClient();

    const { data: ambassador, error } = await supabase
      .from('ambassadors')
      .update({
        status: 'suspended',
        suspended_at: new Date().toISOString(),
        suspended_reason: reason || null,
      })
      .eq('id', ambassadorId)
      .select('*')
      .single();

    if (error) {
      console.error('[Admin Suspend] Update error:', error);
      return NextResponse.json({ error: 'Failed to suspend' }, { status: 500 });
    }

    return NextResponse.json({ ambassador });
  } catch (err) {
    if (err instanceof AdminAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[Admin Suspend] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
