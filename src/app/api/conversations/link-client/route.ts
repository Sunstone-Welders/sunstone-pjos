// ============================================================================
// Link Client — POST /api/conversations/link-client
// ============================================================================
// Creates a client record (or finds existing) and links all phone-only
// conversations from that phone number to the new client.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { normalizePhone } from '@/lib/twilio';

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

  // Check if a client already exists with this phone number
  const digitsOnly = normalizedPhone.replace(/\D/g, '');
  const last10 = digitsOnly.slice(-10);
  const formatted = `(${last10.slice(0, 3)}) ${last10.slice(3, 6)}-${last10.slice(6)}`;

  const { data: existingClients } = await supabase
    .from('clients')
    .select('id')
    .eq('tenant_id', tenantId)
    .or(`phone.eq.${normalizedPhone},phone.eq.${last10},phone.eq.+1${last10},phone.eq.${formatted}`);

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

  // Link all phone-only conversations to the client
  const { error: updateErr } = await supabase
    .from('conversations')
    .update({ client_id: clientId })
    .eq('tenant_id', tenantId)
    .is('client_id', null)
    .eq('phone_number', normalizedPhone);

  if (updateErr) {
    console.error('[LinkClient] Failed to link conversations:', updateErr);
  }

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
