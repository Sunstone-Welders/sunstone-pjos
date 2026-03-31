// ============================================================================
// Ambassador Dashboard API — GET /api/ambassador/dashboard
// ============================================================================
// Returns ambassador record + referral stats for the logged-in user.
// ============================================================================

import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceRoleClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const admin = await createServiceRoleClient();

    // Get ambassador record
    const { data: ambassador } = await admin
      .from('ambassadors')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (!ambassador) {
      return NextResponse.json({ ambassador: null, referrals: [], stats: null });
    }

    // Get referrals
    const { data: referrals } = await admin
      .from('referrals')
      .select('*')
      .eq('ambassador_id', ambassador.id)
      .order('created_at', { ascending: false });

    // Calculate stats
    const allReferrals = referrals || [];
    const stats = {
      totalClicks: allReferrals.filter((r) => r.status === 'clicked').length,
      totalSignups: allReferrals.filter((r) => ['signed_up', 'converted'].includes(r.status)).length,
      totalConverted: allReferrals.filter((r) => r.status === 'converted').length,
      totalEarned: allReferrals.reduce((sum, r) => sum + Number(r.total_commission_earned || 0), 0),
      totalPaid: allReferrals.reduce((sum, r) => sum + Number(r.total_commission_paid || 0), 0),
    };

    return NextResponse.json({ ambassador, referrals: allReferrals, stats });
  } catch (error: any) {
    console.error('[Ambassador Dashboard] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
