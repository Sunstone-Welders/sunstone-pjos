// ============================================================================
// Public Party Details — GET /api/public/party?id=X
// ============================================================================
// Returns party request details for the RSVP page (no sensitive data).
// ============================================================================

import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getSubscriptionTier, canAccessPartyBooking } from '@/lib/subscription';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  }

  const supabase = await createServiceRoleClient();

  const { data: party, error } = await supabase
    .from('party_requests')
    .select('id, tenant_id, host_name, preferred_date, preferred_time, location, estimated_guests, occasion, status')
    .eq('id', id)
    .single();

  if (error || !party) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Get tenant info for display (include subscription + CRM fields for gating)
  const { data: tenant } = await supabase
    .from('tenants')
    .select('name, slug, logo_url, theme_id, waiver_required, subscription_tier, subscription_status, trial_ends_at, admin_tier_override, crm_enabled, crm_subscription_id, crm_trial_end, crm_deactivated_at')
    .eq('id', party.tenant_id)
    .single();

  // Check if party booking is still available for this tenant
  if (tenant) {
    const tier = getSubscriptionTier(tenant as any);
    if (!canAccessPartyBooking(tier, tenant as any)) {
      return NextResponse.json({ error: 'booking_unavailable' }, { status: 403 });
    }
  }

  // Get RSVP count
  const { count } = await supabase
    .from('party_rsvps')
    .select('id', { count: 'exact', head: true })
    .eq('party_request_id', id)
    .eq('attending', true);

  return NextResponse.json({
    party: {
      id: party.id,
      host_name: party.host_name,
      preferred_date: party.preferred_date,
      preferred_time: party.preferred_time,
      location: party.location,
      estimated_guests: party.estimated_guests,
      occasion: party.occasion,
      status: party.status,
    },
    tenant: tenant ? {
      name: tenant.name,
      slug: tenant.slug,
      logo_url: tenant.logo_url,
      theme_id: tenant.theme_id,
      waiver_required: tenant.waiver_required,
    } : null,
    attending_count: count || 0,
  });
}
