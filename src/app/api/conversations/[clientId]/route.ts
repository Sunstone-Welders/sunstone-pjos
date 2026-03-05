// ============================================================================
// Client Messages — GET /api/conversations/:clientId
// ============================================================================
// Returns messages for a specific client conversation.
// Supports cursor-based pagination via ?before=<timestamp>&limit=50
// Supports phone: prefix for phone-only conversations.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

export async function GET(
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

  const limit = Math.min(parseInt(request.nextUrl.searchParams.get('limit') || '50'), 100);
  const before = request.nextUrl.searchParams.get('before');

  const isPhoneOnly = clientId.startsWith('phone:');

  let query = supabase
    .from('conversations')
    .select('*')
    .eq('tenant_id', member.tenant_id)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (isPhoneOnly) {
    const phone = decodeURIComponent(clientId.slice(6));
    query = query.is('client_id', null).eq('phone_number', phone);
  } else {
    query = query.eq('client_id', clientId);
  }

  if (before) {
    query = query.lt('created_at', before);
  }

  const { data: messages, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Return in chronological order
  const chronological = (messages || []).reverse();

  return NextResponse.json({
    messages: chronological,
    hasMore: (messages || []).length === limit,
  });
}
