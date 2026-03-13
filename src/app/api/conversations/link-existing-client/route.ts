// ============================================================================
// Link Existing Client — POST /api/conversations/link-existing-client
// ============================================================================
// Links orphaned phone-only conversations to an existing client and adds the
// phone number as a secondary number on the client record.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { normalizePhone, normalizePhoneDigits } from '@/lib/twilio';

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: member } = await supabase
    .from('tenant_members')
    .select('tenant_id')
    .eq('user_id', user.id)
    .single();

  if (!member) return NextResponse.json({ error: 'No tenant' }, { status: 403 });
  const tenantId = member.tenant_id;

  const body = await request.json();
  const { phone, clientId } = body;

  if (!phone || !clientId) {
    return NextResponse.json({ error: 'phone and clientId are required' }, { status: 400 });
  }

  // Verify client belongs to tenant
  const { data: client } = await supabase
    .from('clients')
    .select('id, phone')
    .eq('id', clientId)
    .eq('tenant_id', tenantId)
    .single();

  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 });

  const normalized = normalizePhone(phone);
  const digits = normalizePhoneDigits(phone);

  // Add as secondary phone number (ignore if already exists)
  await supabase
    .from('client_phone_numbers')
    .insert({
      tenant_id: tenantId,
      client_id: clientId,
      phone: normalized,
      phone_normalized: digits,
      label: 'mobile',
      is_primary: false,
    })
    .select('id')
    .single()
    .then(null, () => {}); // Ignore unique constraint violation

  // Link orphaned conversations
  await supabase.rpc('link_orphaned_conversations', {
    p_tenant_id: tenantId,
    p_client_id: clientId,
    p_digits: digits,
  });

  // Recalculate unread count
  const { count: unreadCount } = await supabase
    .from('conversations')
    .select('*', { count: 'exact', head: true })
    .eq('client_id', clientId)
    .eq('direction', 'inbound')
    .eq('read', false);

  const { data: lastConvo } = await supabase
    .from('conversations')
    .select('created_at')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  await supabase
    .from('clients')
    .update({
      unread_messages: unreadCount || 0,
      last_message_at: lastConvo?.created_at || new Date().toISOString(),
    })
    .eq('id', clientId);

  return NextResponse.json({ success: true, clientId });
}
