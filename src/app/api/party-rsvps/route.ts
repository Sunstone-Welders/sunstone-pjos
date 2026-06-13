// ============================================================================
// Party RSVPs API — POST (public) + GET (authenticated)
// ============================================================================

import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceRoleClient } from '@/lib/supabase/server';
import { checkRateLimit, getClientIP } from '@/lib/rate-limit';
import { getSubscriptionTier, canAccessPartyBooking } from '@/lib/subscription';

// ── POST: Submit RSVP (public, rate-limited) ───────────────────────────────

export async function POST(request: Request) {
  const ip = getClientIP(request);
  const rl = checkRateLimit(ip, { prefix: 'party-rsvp', limit: 10, windowSeconds: 3600 });
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  const body = await request.json();
  const { partyRequestId, name, email, phone, attending, plusOnes } = body;

  if (!partyRequestId || !name) {
    return NextResponse.json({ error: 'partyRequestId and name are required' }, { status: 400 });
  }

  const supabase = await createServiceRoleClient();

  // Get party to find tenant_id
  const { data: party } = await supabase
    .from('party_requests')
    .select('id, tenant_id, status')
    .eq('id', partyRequestId)
    .single();

  if (!party) {
    return NextResponse.json({ error: 'Party not found' }, { status: 404 });
  }

  if (party.status === 'cancelled') {
    return NextResponse.json({ error: 'This party has been cancelled' }, { status: 400 });
  }

  // Check subscription-level party booking access
  const { data: tenant } = await supabase
    .from('tenants')
    .select('subscription_tier, subscription_status, trial_ends_at, admin_tier_override, crm_enabled, crm_subscription_id, crm_trial_end, crm_deactivated_at')
    .eq('id', party.tenant_id)
    .single();

  if (tenant) {
    const tier = getSubscriptionTier(tenant as any);
    if (!canAccessPartyBooking(tier, tenant as any)) {
      return NextResponse.json({ error: 'Party booking is currently unavailable' }, { status: 403 });
    }
  }

  const { data: rsvp, error } = await supabase
    .from('party_rsvps')
    .insert({
      party_request_id: partyRequestId,
      tenant_id: party.tenant_id,
      name: name.trim(),
      email: email || null,
      phone: phone || null,
      attending: attending !== false,
      plus_ones: plusOnes || 0,
    })
    .select('id')
    .single();

  if (error) {
    console.error('RSVP insert failed:', error);
    return NextResponse.json({ error: 'Failed to submit RSVP' }, { status: 500 });
  }

  return NextResponse.json({ id: rsvp.id });
}

// ── GET: List RSVPs for a party (authenticated, tenant-scoped) ─────────────

export async function GET(request: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const partyRequestId = searchParams.get('partyRequestId');

  if (!partyRequestId) {
    return NextResponse.json({ error: 'Missing partyRequestId' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('party_rsvps')
    .select('*')
    .eq('party_request_id', partyRequestId)
    .order('created_at', { ascending: true });

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch RSVPs' }, { status: 500 });
  }

  return NextResponse.json({ rsvps: data || [] });
}
