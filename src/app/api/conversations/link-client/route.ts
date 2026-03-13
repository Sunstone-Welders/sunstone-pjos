// ============================================================================
// Link Client — POST /api/conversations/link-client
// ============================================================================
// Creates a client record (or finds existing) and links all phone-only
// conversations from that phone number to the new client.
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
  const { phone, firstName, lastName, email } = body;

  if (!phone || !firstName?.trim()) {
    return NextResponse.json({ error: 'Phone and first name are required' }, { status: 400 });
  }

  const normalizedPhone = normalizePhone(phone);
  const last10 = normalizePhoneDigits(phone);

  // Check if a client already exists with this phone (normalized digit match)
  const { data: matchedClients } = await supabase.rpc('find_client_by_phone', {
    p_tenant_id: tenantId,
    p_digits: last10,
  });

  const existingClients = matchedClients;

  let clientId: string;

  if (existingClients && existingClients.length > 0) {
    // Update existing client with new name if it was "Unknown"
    clientId = existingClients[0].id;
    await supabase
      .from('clients')
      .update({
        first_name: firstName.trim(),
        ...(lastName?.trim() ? { last_name: lastName.trim() } : {}),
        ...(email?.trim() ? { email: email.trim() } : {}),
      })
      .eq('id', clientId);
  } else {
    // Create new client
    const { data: newClient, error: createErr } = await supabase
      .from('clients')
      .insert({
        tenant_id: tenantId,
        phone: normalizedPhone,
        first_name: firstName.trim(),
        ...(lastName?.trim() ? { last_name: lastName.trim() } : {}),
        ...(email?.trim() ? { email: email.trim() } : {}),
      })
      .select('id')
      .single();

    if (createErr || !newClient) {
      console.error('[LinkClient] Failed to create client:', createErr);
      return NextResponse.json({ error: 'Failed to create client' }, { status: 500 });
    }
    clientId = newClient.id;
  }

  // Link all phone-only conversations to the client (handles any phone format)
  await supabase.rpc('link_orphaned_conversations', {
    p_tenant_id: tenantId,
    p_client_id: clientId,
    p_digits: last10,
  });

  // Calculate unread count and set last_message_at
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
