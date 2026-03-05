// ============================================================================
// Mark Conversation Read — POST /api/conversations/:clientId/read
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
) {
  const { clientId } = await params;
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: member } = await supabase
    .from('tenant_members')
    .select('tenant_id')
    .eq('user_id', user.id)
    .single();

  if (!member) return NextResponse.json({ error: 'No tenant' }, { status: 403 });

  // Mark all unread messages as read
  await supabase
    .from('conversations')
    .update({ read: true })
    .eq('tenant_id', member.tenant_id)
    .eq('client_id', clientId)
    .eq('read', false);

  // Reset client unread counter
  await supabase
    .from('clients')
    .update({ unread_messages: 0 })
    .eq('id', clientId)
    .eq('tenant_id', member.tenant_id);

  return NextResponse.json({ success: true });
}
