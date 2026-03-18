// ============================================================================
// Reorder History — src/app/api/reorders/route.ts
// ============================================================================
// GET: List reorder history for the authenticated user's tenant.
// ============================================================================

import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = await createServerSupabase();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { data: member } = await supabase
      .from('tenant_members')
      .select('tenant_id')
      .eq('user_id', user.id)
      .limit(1)
      .single();

    if (!member) {
      return NextResponse.json({ error: 'No tenant membership' }, { status: 403 });
    }

    const { data: reorders, error } = await supabase
      .from('reorder_history')
      .select('*')
      .eq('tenant_id', member.tenant_id)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('[Reorders] Error:', error.message);
      return NextResponse.json({ error: 'Failed to fetch reorders' }, { status: 500 });
    }

    return NextResponse.json({ reorders: reorders || [] });
  } catch (err: any) {
    console.error('[Reorders] Error:', err);
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
  }
}
