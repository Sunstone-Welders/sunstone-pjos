// ============================================================================
// Unread Count — GET /api/conversations/unread-count
// ============================================================================
// Includes both client-linked and phone-only unread counts.
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

  // Client-linked unreads
  const { data: clientData } = await supabase
    .from('clients')
    .select('unread_messages')
    .eq('tenant_id', member.tenant_id)
    .gt('unread_messages', 0);

  const clientCount = (clientData || []).reduce((sum, c) => sum + (c.unread_messages || 0), 0);

  // Phone-only unreads (conversations with client_id IS NULL)
  const { count: phoneCount } = await supabase
    .from('conversations')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', member.tenant_id)
    .is('client_id', null)
    .eq('direction', 'inbound')
    .eq('read', false);

  return NextResponse.json({ count: clientCount + (phoneCount || 0) });
}
