// ============================================================================
// Party Requests API — POST (public) + GET (authenticated)
// ============================================================================

import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceRoleClient } from '@/lib/supabase/server';
import { checkRateLimit, getClientIP } from '@/lib/rate-limit';
import { normalizePhone, sendSMS } from '@/lib/twilio';
import { handlePartyStatusChange } from '@/lib/party-templates';
import { getSubscriptionTier, canAccessPartyBooking } from '@/lib/subscription';

// ── POST: Create a party request (public) ──────────────────────────────────

export async function POST(request: Request) {
  // Rate limit: 5 per hour per IP
  const ip = getClientIP(request);
  const rl = checkRateLimit(ip, { prefix: 'party-request', limit: 5, windowSeconds: 3600 });
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
  }

  const body = await request.json();
  const { tenantId, hostName, hostPhone, hostEmail, preferredDate, preferredTime, estimatedGuests, occasion, message } = body;

  if (!tenantId || !hostName || !hostPhone) {
    return NextResponse.json({ error: 'tenantId, hostName, and hostPhone are required' }, { status: 400 });
  }

  const supabase = await createServiceRoleClient();

  // Verify tenant exists and has party booking enabled
  const { data: tenant } = await supabase
    .from('tenants')
    .select('id, name, phone, profile_settings, subscription_tier, subscription_status, trial_ends_at, admin_tier_override, crm_enabled, crm_subscription_id, crm_trial_end, crm_deactivated_at')
    .eq('id', tenantId)
    .single();

  if (!tenant) {
    return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
  }

  const settings = (tenant.profile_settings || {}) as Record<string, boolean>;
  if (!settings.enabled || !settings.show_party_booking) {
    return NextResponse.json({ error: 'Party booking is not enabled' }, { status: 400 });
  }

  // Check subscription-level party booking access (Pro/Business OR CRM active)
  const tier = getSubscriptionTier(tenant as any);
  if (!canAccessPartyBooking(tier, tenant as any)) {
    return NextResponse.json({ error: 'Party booking is currently unavailable' }, { status: 403 });
  }

  // Normalize phone and try to match existing client
  const normalizedPhone = normalizePhone(hostPhone);
  let clientId: string | null = null;

  const { data: existingClient } = await supabase
    .from('clients')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('phone', normalizedPhone)
    .limit(1)
    .single();

  if (existingClient) {
    clientId = existingClient.id;
  }

  // Insert party request
  const { data: partyRequest, error: insertError } = await supabase
    .from('party_requests')
    .insert({
      tenant_id: tenantId,
      client_id: clientId,
      host_name: hostName,
      host_phone: normalizedPhone,
      host_email: hostEmail || null,
      preferred_date: preferredDate || null,
      preferred_time: preferredTime || null,
      estimated_guests: estimatedGuests || null,
      occasion: occasion || null,
      message: message || null,
    })
    .select('id')
    .single();

  if (insertError) {
    console.error('Party request insert failed:', insertError);
    return NextResponse.json({ error: 'Failed to create request' }, { status: 500 });
  }

  // Fire-and-forget SMS notification to tenant
  if (tenant.phone) {
    const guestText = estimatedGuests ? ` ${estimatedGuests} guests.` : '';
    const dateText = preferredDate ? ` Preferred date: ${preferredDate}.` : '';
    sendSMS({
      to: tenant.phone,
      body: `🎉 New party request from ${hostName}!${guestText}${dateText} Check your Sunstone dashboard for details.`,
      tenantId: tenant.id,
      skipConsentCheck: true,
    }).catch(() => {});
  }

  // Fire booking confirmation sequence (fire-and-forget, all tiers)
  handlePartyStatusChange(partyRequest.id, 'new', tenantId).catch((err) => {
    console.error('Party booking confirmation error:', err);
  });

  return NextResponse.json({ id: partyRequest.id });
}

// ── GET: List party requests (authenticated, tenant-scoped) ────────────────

export async function GET(request: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Get tenant membership
  const { data: member } = await supabase
    .from('tenant_members')
    .select('tenant_id')
    .eq('user_id', user.id)
    .limit(1)
    .single();

  if (!member) {
    return NextResponse.json({ error: 'No tenant' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');

  let query = supabase
    .from('party_requests')
    .select('*, party_rsvps(id, attending)')
    .eq('tenant_id', member.tenant_id)
    .order('created_at', { ascending: false });

  if (status) {
    query = query.eq('status', status);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Party requests fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 });
  }

  // Compute RSVP counts
  const requests = (data || []).map((r: any) => {
    const rsvps = r.party_rsvps || [];
    return {
      ...r,
      party_rsvps: undefined,
      rsvp_count: rsvps.length,
      attending_count: rsvps.filter((rv: any) => rv.attending).length,
    };
  });

  return NextResponse.json({ requests });
}
