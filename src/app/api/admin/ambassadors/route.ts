// ============================================================================
// Admin Ambassadors API — GET /api/admin/ambassadors
// ============================================================================
// Lists all ambassadors with stats. Platform admin only.
// ============================================================================

import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { verifyPlatformAdmin, AdminAuthError } from '@/lib/admin/verify-platform-admin';

export async function GET() {
  try {
    await verifyPlatformAdmin();
    const supabase = await createServiceRoleClient();

    // Get all ambassadors
    const { data: ambassadors, error } = await supabase
      .from('ambassadors')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[Admin Ambassadors] Query error:', error);
      return NextResponse.json({ error: 'Failed to load ambassadors' }, { status: 500 });
    }

    // Get referral counts per ambassador
    const { data: referrals } = await supabase
      .from('referrals')
      .select('ambassador_id, status, total_commission_earned');

    // Build stats map
    const statsMap: Record<string, { totalReferrals: number; signups: number; converted: number; totalEarned: number }> = {};
    for (const r of referrals || []) {
      if (!statsMap[r.ambassador_id]) {
        statsMap[r.ambassador_id] = { totalReferrals: 0, signups: 0, converted: 0, totalEarned: 0 };
      }
      statsMap[r.ambassador_id].totalReferrals++;
      if (['signed_up', 'converted'].includes(r.status)) statsMap[r.ambassador_id].signups++;
      if (r.status === 'converted') statsMap[r.ambassador_id].converted++;
      statsMap[r.ambassador_id].totalEarned += Number(r.total_commission_earned || 0);
    }

    // Enrich ambassadors with stats
    const enriched = (ambassadors || []).map((a) => ({
      ...a,
      stats: statsMap[a.id] || { totalReferrals: 0, signups: 0, converted: 0, totalEarned: 0 },
    }));

    // Aggregate stats
    const summary = {
      total: enriched.length,
      active: enriched.filter((a) => a.status === 'active').length,
      pending: enriched.filter((a) => a.status === 'pending').length,
      totalReferrals: (referrals || []).length,
      totalEarned: Object.values(statsMap).reduce((sum, s) => sum + s.totalEarned, 0),
    };

    return NextResponse.json({ ambassadors: enriched, summary });
  } catch (err) {
    if (err instanceof AdminAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[Admin Ambassadors] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
