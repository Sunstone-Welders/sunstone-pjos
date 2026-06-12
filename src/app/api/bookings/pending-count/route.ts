// ============================================================================
// Pending Bookings Count — GET /api/bookings/pending-count
// ============================================================================
// Authenticated. Returns the number of pending bookings for the user's tenant.
// Used by the nav badge to show pending request count.
// ============================================================================

import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

export async function GET() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ count: 0 });

  const { data: member } = await supabase
    .from('tenant_members')
    .select('tenant_id')
    .eq('user_id', user.id)
    .limit(1)
    .single();
  if (!member) return NextResponse.json({ count: 0 });

  const { count } = await supabase
    .from('bookings')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', member.tenant_id)
    .eq('status', 'pending');

  return NextResponse.json({ count: count || 0 });
}
