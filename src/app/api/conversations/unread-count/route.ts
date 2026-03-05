// ============================================================================
// Unread Count — GET /api/conversations/unread-count
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ count: 0 });

  const { data: member } = await supabase
    .from('tenant_members')
    .select('tenant_id')
    .eq('user_id', user.id)
    .single();

  if (!member) return NextResponse.json({ count: 0 });

  const { data } = await supabase
    .from('clients')
    .select('unread_messages')
    .eq('tenant_id', member.tenant_id)
    .gt('unread_messages', 0);

  const count = (data || []).reduce((sum, c) => sum + (c.unread_messages || 0), 0);

  return NextResponse.json({ count });
}
