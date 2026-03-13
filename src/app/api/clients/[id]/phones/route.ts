// ============================================================================
// Client Phone Numbers — GET/POST/DELETE /api/clients/:id/phones
// ============================================================================
// Manage secondary phone numbers for a client.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { normalizePhone, normalizePhoneDigits } from '@/lib/twilio';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: clientId } = await params;
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: member } = await supabase
    .from('tenant_members')
    .select('tenant_id')
    .eq('user_id', user.id)
    .single();

  if (!member) return NextResponse.json({ error: 'No tenant' }, { status: 403 });

  const { data: phones, error } = await supabase
    .from('client_phone_numbers')
    .select('*')
    .eq('client_id', clientId)
    .eq('tenant_id', member.tenant_id)
    .order('is_primary', { ascending: false })
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[ClientPhones] GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch phones' }, { status: 500 });
  }

  return NextResponse.json({ phones: phones || [] });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: clientId } = await params;
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
  const { phone, label } = body;

  if (!phone?.trim()) {
    return NextResponse.json({ error: 'Phone number is required' }, { status: 400 });
  }

  const normalized = normalizePhone(phone.trim());
  const digits = normalizePhoneDigits(phone.trim());

  if (digits.length !== 10) {
    return NextResponse.json({ error: 'Invalid phone number' }, { status: 400 });
  }

  // Verify client belongs to tenant
  const { data: client } = await supabase
    .from('clients')
    .select('id')
    .eq('id', clientId)
    .eq('tenant_id', tenantId)
    .single();

  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 });

  // Insert (unique constraint will prevent duplicates)
  const { data: phoneRecord, error: insertErr } = await supabase
    .from('client_phone_numbers')
    .insert({
      tenant_id: tenantId,
      client_id: clientId,
      phone: normalized,
      phone_normalized: digits,
      label: label || 'mobile',
      is_primary: false,
    })
    .select('*')
    .single();

  if (insertErr) {
    if (insertErr.code === '23505') {
      return NextResponse.json({ error: 'This phone number is already in use' }, { status: 409 });
    }
    console.error('[ClientPhones] POST error:', insertErr);
    return NextResponse.json({ error: 'Failed to add phone' }, { status: 500 });
  }

  return NextResponse.json({ phone: phoneRecord });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: clientId } = await params;
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: member } = await supabase
    .from('tenant_members')
    .select('tenant_id')
    .eq('user_id', user.id)
    .single();

  if (!member) return NextResponse.json({ error: 'No tenant' }, { status: 403 });

  const body = await request.json();
  const { phoneId } = body;

  if (!phoneId) {
    return NextResponse.json({ error: 'phoneId is required' }, { status: 400 });
  }

  // Fetch the phone record and reject if primary
  const { data: phoneRecord } = await supabase
    .from('client_phone_numbers')
    .select('id, is_primary')
    .eq('id', phoneId)
    .eq('client_id', clientId)
    .eq('tenant_id', member.tenant_id)
    .single();

  if (!phoneRecord) {
    return NextResponse.json({ error: 'Phone not found' }, { status: 404 });
  }

  if (phoneRecord.is_primary) {
    return NextResponse.json({ error: 'Cannot delete primary phone number' }, { status: 400 });
  }

  const { error: deleteErr } = await supabase
    .from('client_phone_numbers')
    .delete()
    .eq('id', phoneId);

  if (deleteErr) {
    console.error('[ClientPhones] DELETE error:', deleteErr);
    return NextResponse.json({ error: 'Failed to delete phone' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
