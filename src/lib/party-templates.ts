// ============================================================================
// Party Templates — src/lib/party-templates.ts
// ============================================================================
// Default party message templates, party-specific variable resolution, and
// automated sequence scheduling. Hooks into the existing template system
// (renderTemplate from src/lib/templates.ts) and message_templates table.
// ============================================================================

import { createServiceRoleClient } from '@/lib/supabase/server';
import { renderTemplate } from '@/lib/templates';
import { sendSMS, normalizePhone, normalizePhoneDigits } from '@/lib/twilio';
import { getCrmStatus } from '@/lib/crm-status';

// ============================================================================
// Default Party Templates (seeded per tenant)
// ============================================================================

export const DEFAULT_PARTY_TEMPLATES = [
  {
    name: 'Party Booking Confirmation',
    channel: 'sms',
    category: 'party',
    is_default: true,
    body: 'Hi {{host_name}}! Your permanent jewelry party request has been received! We\'ll be in touch shortly to confirm the details for your {{party_type}} on {{party_date}}. So excited to make this a night to remember! — {{business_name}}',
  },
  {
    name: 'Party Confirmed',
    channel: 'sms',
    category: 'party',
    is_default: true,
    body: 'Great news, {{host_name}}! Your {{party_type}} on {{party_date}} is officially confirmed! Share this link with your guests so they can RSVP: {{rsvp_link}} — {{business_name}}',
  },
  {
    name: 'Party Reminder — 1 Week',
    channel: 'sms',
    category: 'party',
    is_default: true,
    body: 'Hi {{host_name}}! Just a week until your permanent jewelry party on {{party_date}}! So far {{rsvp_count}} guests have RSVP\'d. Share the link with anyone who hasn\'t responded yet: {{rsvp_link}} — {{business_name}}',
  },
  {
    name: 'Party Reminder — Day Before',
    channel: 'sms',
    category: 'party',
    is_default: true,
    body: 'Hi {{host_name}}! Your permanent jewelry party is TOMORROW! I\'ll have everything set up and ready to go. Can\'t wait to see everyone! — {{business_name}}',
  },
  {
    name: 'Party Day',
    channel: 'sms',
    category: 'party',
    is_default: true,
    body: 'Today\'s the day, {{host_name}}! I\'m getting everything packed up for your party. See you soon! — {{business_name}}',
  },
  {
    name: 'Post-Party Thank You',
    channel: 'sms',
    category: 'party',
    is_default: true,
    body: '{{host_name}}, thank you SO much for hosting! Your guests were amazing and I had the best time. If anyone wants to book their own party or needs a re-weld, just send them my way! — {{business_name}}',
  },
  {
    name: 'Host Reward Earned',
    channel: 'sms',
    category: 'party',
    is_default: true,
    body: 'Amazing news, {{host_name}}! Your party hit ${{total_party_revenue}} in sales — you earned a reward! I\'ll reach out to arrange it. Thank you for being an incredible host! — {{business_name}}',
  },
  {
    name: 'Guest RSVP Reminder',
    channel: 'sms',
    category: 'party',
    is_default: true,
    body: 'Hi {{guest_name}}! You\'re invited to a permanent jewelry party on {{party_date}}! RSVP here: {{rsvp_link}} — Hope to see you there! — {{business_name}}',
  },
  {
    name: 'Party Cancelled',
    channel: 'sms',
    category: 'party',
    is_default: true,
    body: 'Hi {{host_name}}, your permanent jewelry party on {{party_date}} has been cancelled. If you\'d like to reschedule, just let me know! — {{business_name}}',
  },
];

// ============================================================================
// Default Guest Post-Party Templates (seeded per tenant, category: party-guest)
// ============================================================================

export const DEFAULT_GUEST_TEMPLATES = [
  {
    name: 'Guest Thank You + Aftercare',
    channel: 'sms',
    category: 'party-guest',
    is_default: true,
    body: 'Hi {{guest_name}}! Thank you for coming to {{host_name}}\'s party! Here are a few tips to keep your permanent jewelry looking beautiful: avoid pulling or tugging, keep it dry for the first 24 hours, and it\'s totally fine to shower with it daily after that. If you ever need a re-weld, just reach out! — {{business_name}}',
  },
  {
    name: 'Guest Social Share',
    channel: 'sms',
    category: 'party-guest',
    is_default: true,
    body: 'Hi {{guest_name}}! How are you loving your new permanent jewelry? We\'d love to see it! Tag us on Instagram {{instagram_url}} — it makes our day seeing you sparkle! — {{business_name}}',
  },
  {
    name: 'Guest Book Your Own Party',
    channel: 'sms',
    category: 'party-guest',
    is_default: true,
    body: 'Hi {{guest_name}}! Have friends who are jealous of your permanent jewelry? Host your own party and make it a night to remember! Check out the details here: {{profile_url}} — {{business_name}}',
  },
  {
    name: 'Guest Collection Nudge',
    channel: 'sms',
    category: 'party-guest',
    is_default: true,
    body: 'Hi {{guest_name}}! Ready to add to your permanent jewelry collection? Whether it\'s a new bracelet, anklet, or a piece for someone special — we\'d love to see you again! Book anytime at {{profile_url}} — {{business_name}}',
  },
  {
    name: 'Guest Opt-In Invite',
    channel: 'sms',
    category: 'party-guest',
    is_default: true,
    body: 'Hi {{guest_name}}! It was so fun meeting you at {{host_name}}\'s party! If you\'d like to hear about future events and special offers, you can sign up for updates here: {{profile_url}} — {{business_name}}',
  },
];

// ============================================================================
// Party-Specific Template Variables
// ============================================================================

/** Variable descriptions for UI display */
export const PARTY_TEMPLATE_VARIABLES = [
  { key: 'host_name', label: 'Host Name', example: 'Jessica' },
  { key: 'party_date', label: 'Party Date', example: 'Saturday, March 22' },
  { key: 'party_time', label: 'Party Time', example: '6:00 PM' },
  { key: 'party_type', label: 'Party Type / Occasion', example: "Girls' Night" },
  { key: 'estimated_guests', label: 'Estimated Guests', example: '8' },
  { key: 'party_location', label: 'Party Location', example: '123 Main St' },
  { key: 'rsvp_link', label: 'RSVP Link', example: 'sunstonepj.app/studio/your-studio/party/...' },
  { key: 'rsvp_count', label: 'RSVP Count', example: '5' },
  { key: 'deposit_amount', label: 'Deposit Amount', example: '50' },
  { key: 'minimum_guarantee', label: 'Minimum Guarantee', example: '500' },
  { key: 'total_party_revenue', label: 'Total Party Revenue', example: '850' },
  { key: 'business_name', label: 'Business Name', example: 'Golden Touch PJ' },
  { key: 'profile_url', label: 'Profile URL', example: 'sunstonepj.app/studio/your-studio' },
  { key: 'instagram_url', label: 'Instagram URL', example: '@goldentouchpj' },
  { key: 'guest_name', label: 'Guest Name', example: 'Sarah' },
] as const;

/**
 * Resolve party-specific template variables from a party request + tenant.
 * Returns a Record<string, string> to pass into renderTemplate().
 */
export function resolvePartyVariables(
  party: {
    host_name: string;
    preferred_date: string | null;
    preferred_time: string | null;
    occasion: string | null;
    estimated_guests: number | null;
    location: string | null;
    deposit_amount?: number;
    minimum_guarantee?: number;
    total_revenue?: number;
    id: string;
  },
  tenant: {
    name: string;
    slug: string;
    phone?: string | null;
    instagram_url?: string | null;
  },
  rsvpCount?: number
): Record<string, string> {
  // Format date nicely
  let formattedDate = 'your upcoming date';
  if (party.preferred_date) {
    try {
      const d = new Date(party.preferred_date + 'T12:00:00');
      formattedDate = d.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
      });
    } catch {
      formattedDate = party.preferred_date;
    }
  }

  // Format occasion nicely
  const occasion = party.occasion || 'permanent jewelry party';

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://sunstonepj.app';

  return {
    host_name: party.host_name,
    party_date: formattedDate,
    party_time: party.preferred_time || '',
    party_type: occasion,
    estimated_guests: party.estimated_guests ? String(party.estimated_guests) : '',
    party_location: party.location || '',
    rsvp_link: `${baseUrl}/studio/${tenant.slug}/party/${party.id}`,
    rsvp_count: String(rsvpCount ?? 0),
    deposit_amount: party.deposit_amount ? String(party.deposit_amount) : '0',
    minimum_guarantee: party.minimum_guarantee ? String(party.minimum_guarantee) : '0',
    total_party_revenue: party.total_revenue ? String(Math.round(party.total_revenue)) : '0',
    business_name: tenant.name || 'our studio',
    business_phone: tenant.phone || '',
    profile_url: `${baseUrl}/studio/${tenant.slug}`,
    instagram_url: tenant.instagram_url || '',
    guest_name: '', // Placeholder — only used for guest-facing templates
  };
}

// ============================================================================
// Template Seeding
// ============================================================================

/**
 * Seed default party templates for a tenant if they don't have any.
 * Returns the tenant's party templates (existing or newly created).
 */
export async function seedPartyTemplates(tenantId: string): Promise<void> {
  const supabase = await createServiceRoleClient();

  const { data: existing } = await supabase
    .from('message_templates')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('category', 'party')
    .limit(1);

  if (!existing || existing.length === 0) {
    await supabase.from('message_templates').insert(
      DEFAULT_PARTY_TEMPLATES.map((t) => ({ ...t, tenant_id: tenantId }))
    );
  }

  // Also seed guest templates if missing
  const { data: existingGuest } = await supabase
    .from('message_templates')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('category', 'party-guest')
    .limit(1);

  if (!existingGuest || existingGuest.length === 0) {
    await supabase.from('message_templates').insert(
      DEFAULT_GUEST_TEMPLATES.map((t) => ({ ...t, tenant_id: tenantId }))
    );
  }
}

/**
 * Get a specific party template body by name for a tenant.
 * Falls back to default if tenant hasn't customized it.
 */
async function getTemplateBody(
  tenantId: string,
  templateName: string
): Promise<string> {
  const supabase = await createServiceRoleClient();

  const { data } = await supabase
    .from('message_templates')
    .select('body')
    .eq('tenant_id', tenantId)
    .eq('name', templateName)
    .limit(1)
    .single();

  if (data) return data.body;

  // Fall back to hardcoded default (check both host and guest templates)
  const def = DEFAULT_PARTY_TEMPLATES.find((t) => t.name === templateName)
    || DEFAULT_GUEST_TEMPLATES.find((t) => t.name === templateName);
  return def?.body || templateName;
}

// ============================================================================
// Sequence Scheduling
// ============================================================================

/**
 * Fire the appropriate party message sequence based on a status change.
 * Called from the party request PATCH handler.
 *
 * - 'new' → Booking Confirmation (all tiers, immediate)
 * - 'confirmed' → Confirmed message (immediate) + schedule reminders (CRM-gated)
 * - 'completed' → Thank you (2hr delay, CRM-gated) + reward notification (if earned)
 * - 'cancelled' → Cancel all pending, send cancellation message
 */
export async function handlePartyStatusChange(
  partyRequestId: string,
  newStatus: string,
  tenantId: string
): Promise<void> {
  const supabase = await createServiceRoleClient();

  // Fetch party request
  const { data: party } = await supabase
    .from('party_requests')
    .select('*')
    .eq('id', partyRequestId)
    .single();

  if (!party) return;

  // Fetch tenant
  const { data: tenant } = await supabase
    .from('tenants')
    .select('name, slug, phone, dedicated_phone_number, party_auto_reminders, party_reward_settings, party_guest_sequences, instagram_url, crm_enabled, crm_subscription_id, crm_trial_end, crm_deactivated_at')
    .eq('id', tenantId)
    .single();

  if (!tenant) return;

  const crmActive = getCrmStatus(tenant).active;
  const autoReminders = tenant.party_auto_reminders !== false;

  // Seed party templates if needed
  await seedPartyTemplates(tenantId);

  // Get RSVP count
  const { count: rsvpCount } = await supabase
    .from('party_rsvps')
    .select('id', { count: 'exact', head: true })
    .eq('party_request_id', partyRequestId)
    .eq('attending', true);

  const variables = resolvePartyVariables(party, tenant, rsvpCount || 0);

  // Helper to send a message immediately
  const sendImmediate = async (templateName: string) => {
    if (!party.host_phone || !tenant.dedicated_phone_number) return;
    const body = await getTemplateBody(tenantId, templateName);
    const resolved = renderTemplate(body, variables);

    // Send SMS
    sendSMS({
      to: normalizePhone(party.host_phone),
      body: resolved,
      tenantId,
    }).catch(() => {});

    // Log to party_scheduled_messages as 'sent'
    await supabase.from('party_scheduled_messages').insert({
      tenant_id: tenantId,
      party_request_id: partyRequestId,
      template_name: templateName,
      recipient_phone: normalizePhone(party.host_phone),
      recipient_name: party.host_name,
      message_body: resolved,
      scheduled_for: new Date().toISOString(),
      sent_at: new Date().toISOString(),
      status: 'sent',
    });
  };

  // Helper to schedule a future message
  const scheduleFuture = async (templateName: string, sendAt: Date) => {
    if (!party.host_phone) return;
    const body = await getTemplateBody(tenantId, templateName);
    const resolved = renderTemplate(body, variables);

    await supabase.from('party_scheduled_messages').insert({
      tenant_id: tenantId,
      party_request_id: partyRequestId,
      template_name: templateName,
      recipient_phone: normalizePhone(party.host_phone),
      recipient_name: party.host_name,
      message_body: resolved,
      scheduled_for: sendAt.toISOString(),
      status: 'pending',
    });
  };

  switch (newStatus) {
    // ── New booking → send confirmation (all tiers) ──────────────────────
    case 'new': {
      await sendImmediate('Party Booking Confirmation');
      break;
    }

    // ── Confirmed → send confirmation + schedule reminders (CRM-gated) ──
    case 'confirmed': {
      await sendImmediate('Party Confirmed');

      // Schedule reminders only for CRM users with auto-reminders enabled
      if (crmActive && autoReminders && party.preferred_date) {
        const partyDate = new Date(party.preferred_date + 'T12:00:00');
        const now = new Date();

        // 1 week before (at 10am)
        const oneWeekBefore = new Date(partyDate);
        oneWeekBefore.setDate(oneWeekBefore.getDate() - 7);
        oneWeekBefore.setHours(10, 0, 0, 0);
        if (oneWeekBefore > now) {
          await scheduleFuture('Party Reminder — 1 Week', oneWeekBefore);
        }

        // Day before (at 10am)
        const dayBefore = new Date(partyDate);
        dayBefore.setDate(dayBefore.getDate() - 1);
        dayBefore.setHours(10, 0, 0, 0);
        if (dayBefore > now) {
          await scheduleFuture('Party Reminder — Day Before', dayBefore);
        }

        // Morning of (at 9am)
        const morningOf = new Date(partyDate);
        morningOf.setHours(9, 0, 0, 0);
        if (morningOf > now) {
          await scheduleFuture('Party Day', morningOf);
        }
      }
      break;
    }

    // ── Completed → thank you (CRM-gated) + reward if earned + guest sequences ─
    case 'completed': {
      if (crmActive) {
        // Thank you 2 hours after marking complete
        const twoHoursLater = new Date(Date.now() + 2 * 60 * 60 * 1000);
        await scheduleFuture('Post-Party Thank You', twoHoursLater);

        // Host reward notification — only if reward settings are enabled and revenue qualifies
        const rewardSettings = tenant.party_reward_settings as any;
        if (rewardSettings?.enabled && party.total_revenue > 0) {
          const minSpend = rewardSettings.minimum_spend || 0;
          if (party.total_revenue >= minSpend) {
            const threeHoursLater = new Date(Date.now() + 3 * 60 * 60 * 1000);
            await scheduleFuture('Host Reward Earned', threeHoursLater);
          }
        }
      }

      // Guest post-party sequences (fire-and-forget)
      if ((tenant as any).party_guest_sequences !== false) {
        scheduleGuestSequences(
          supabase, tenantId, partyRequestId, party, tenant, variables, crmActive
        ).catch((err: unknown) => {
          console.error('[Party] Failed to schedule guest sequences:', err);
        });
      }
      break;
    }

    // ── Cancelled → cancel all pending, send cancellation ────────────────
    case 'cancelled': {
      // Cancel all pending scheduled messages for this party
      await supabase
        .from('party_scheduled_messages')
        .update({ status: 'cancelled' })
        .eq('party_request_id', partyRequestId)
        .eq('status', 'pending');

      // Send cancellation message
      await sendImmediate('Party Cancelled');

      // Add note about deposit if paid
      if (party.deposit_status === 'paid' && party.deposit_amount > 0) {
        const depositNote = `Party cancelled. Deposit of $${party.deposit_amount} was collected. Process refund manually in Stripe if needed.`;
        await supabase
          .from('party_requests')
          .update({ notes: party.notes ? `${party.notes}\n\n${depositNote}` : depositNote })
          .eq('id', partyRequestId);
      }
      break;
    }
  }
}

// ============================================================================
// Guest Variable Resolution
// ============================================================================

/**
 * Extend party variables with guest-specific fields.
 */
function resolveGuestVariables(
  partyVars: Record<string, string>,
  guest: { name: string }
): Record<string, string> {
  // Use first name only
  const firstName = guest.name.split(' ')[0] || guest.name;
  return { ...partyVars, guest_name: firstName };
}

// ============================================================================
// Guest Post-Party Sequence Scheduling
// ============================================================================

/**
 * Schedule guest marketing sequences when a party is marked "completed."
 * Track A (waiver + SMS consent): G1 + G2 (if instagram) + G3 + G4
 * Track B (RSVP-only, no consent): G1 + G5 only
 */
async function scheduleGuestSequences(
  supabase: Awaited<ReturnType<typeof createServiceRoleClient>>,
  tenantId: string,
  partyRequestId: string,
  party: { host_phone: string; host_name: string; id: string },
  tenant: { name: string; slug: string; dedicated_phone_number?: string | null; instagram_url?: string | null },
  partyVars: Record<string, string>,
  crmActive: boolean
): Promise<void> {
  if (!tenant.dedicated_phone_number) return;

  // Idempotency: check if guest messages already exist
  const { count: existingCount } = await supabase
    .from('party_scheduled_messages')
    .select('id', { count: 'exact', head: true })
    .eq('party_request_id', partyRequestId)
    .not('party_rsvp_id', 'is', null);

  if (existingCount && existingCount > 0) return;

  // Fetch attending RSVPs with phone numbers
  const { data: rsvps } = await supabase
    .from('party_rsvps')
    .select('id, name, phone, waiver_signed, waiver_id')
    .eq('party_request_id', partyRequestId)
    .eq('attending', true)
    .not('phone', 'is', null);

  if (!rsvps || rsvps.length === 0) return;

  // Normalize host phone for comparison
  const hostDigits = party.host_phone ? normalizePhoneDigits(party.host_phone) : '';

  const now = new Date();

  for (const rsvp of rsvps) {
    if (!rsvp.phone) continue;

    // Skip if phone matches host
    const guestDigits = normalizePhoneDigits(rsvp.phone);
    if (hostDigits && guestDigits === hostDigits) continue;

    // Determine track: check waiver SMS consent
    let isTrackA = false;
    if (rsvp.waiver_signed && rsvp.waiver_id) {
      const { data: waiver } = await supabase
        .from('waivers')
        .select('sms_consent')
        .eq('id', rsvp.waiver_id)
        .single();
      isTrackA = waiver?.sms_consent === true;
    }

    const guestVars = resolveGuestVariables(partyVars, rsvp);
    const guestPhone = normalizePhone(rsvp.phone);
    const guestFirstName = rsvp.name.split(' ')[0] || rsvp.name;

    // Track A: find or create CRM client, apply tags
    let clientId: string | null = null;
    if (isTrackA) {
      clientId = await findOrCreateGuestClient(
        supabase, tenantId, rsvp, guestPhone
      );
      if (clientId) {
        // Link RSVP to client
        await supabase
          .from('party_rsvps')
          .update({ client_id: clientId })
          .eq('id', rsvp.id);

        // Apply tags (fire-and-forget)
        applyPartyGuestTags(supabase, tenantId, clientId, party.host_name).catch(() => {});
      }
    }

    // Helper to schedule a guest message
    const scheduleGuest = async (templateName: string, sendAt: Date) => {
      const body = await getTemplateBody(tenantId, templateName);
      const resolved = renderTemplate(body, guestVars);
      await supabase.from('party_scheduled_messages').insert({
        tenant_id: tenantId,
        party_request_id: partyRequestId,
        party_rsvp_id: rsvp.id,
        template_name: templateName,
        recipient_phone: guestPhone,
        recipient_name: guestFirstName,
        message_body: resolved,
        scheduled_for: sendAt.toISOString(),
        status: 'pending',
      });
    };

    // ── G1: Guest Thank You + Aftercare (Day 0, +2hrs) — ALL tiers, both tracks ─
    const g1Time = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    await scheduleGuest('Guest Thank You + Aftercare', g1Time);

    if (isTrackA && crmActive) {
      // ── G2: Social Share (Day 3, 11am) — CRM only, skip if no instagram_url ─
      if (tenant.instagram_url) {
        const g2Time = new Date(now);
        g2Time.setDate(g2Time.getDate() + 3);
        g2Time.setHours(11, 0, 0, 0);
        await scheduleGuest('Guest Social Share', g2Time);
      }

      // ── G3: Book Your Own Party (Day 10, 11am) — CRM only ─
      const g3Time = new Date(now);
      g3Time.setDate(g3Time.getDate() + 10);
      g3Time.setHours(11, 0, 0, 0);
      await scheduleGuest('Guest Book Your Own Party', g3Time);

      // ── G4: Collection Nudge (Day 21, 11am) — CRM only ─
      const g4Time = new Date(now);
      g4Time.setDate(g4Time.getDate() + 21);
      g4Time.setHours(11, 0, 0, 0);
      await scheduleGuest('Guest Collection Nudge', g4Time);
    } else if (!isTrackA) {
      // ── G5: Opt-In Invite (Day 3, 11am) — ALL tiers, Track B only ─
      const g5Time = new Date(now);
      g5Time.setDate(g5Time.getDate() + 3);
      g5Time.setHours(11, 0, 0, 0);
      await scheduleGuest('Guest Opt-In Invite', g5Time);
    }
  }
}

// ============================================================================
// Guest Client Matching / Creation
// ============================================================================

/**
 * Find an existing client by phone, or create a new one for a party guest.
 * Returns the client_id or null.
 */
async function findOrCreateGuestClient(
  supabase: Awaited<ReturnType<typeof createServiceRoleClient>>,
  tenantId: string,
  rsvp: { name: string; phone: string | null; email?: string | null },
  normalizedPhone: string
): Promise<string | null> {
  const digits = normalizePhoneDigits(normalizedPhone);

  // Try to find existing client
  const { data: matched } = await supabase.rpc('find_client_by_phone', {
    p_tenant_id: tenantId,
    p_digits: digits,
  });

  if (matched && matched.length > 0) {
    return matched[0].id;
  }

  // Create new client
  const nameParts = rsvp.name.trim().split(/\s+/);
  const firstName = nameParts[0] || rsvp.name;
  const lastName = nameParts.slice(1).join(' ') || null;

  const { data: newClient } = await supabase
    .from('clients')
    .insert({
      tenant_id: tenantId,
      first_name: firstName,
      last_name: lastName,
      phone: normalizedPhone,
      email: rsvp.email || null,
      source: 'party_guest',
    })
    .select('id')
    .single();

  return newClient?.id || null;
}

// ============================================================================
// Guest Tag Application
// ============================================================================

/**
 * Apply "Party Guest" and "{Host}'s Party" tags to a guest client.
 * Uses check-then-insert pattern matching auto-tags.ts.
 */
async function applyPartyGuestTags(
  supabase: Awaited<ReturnType<typeof createServiceRoleClient>>,
  tenantId: string,
  clientId: string,
  hostName: string
): Promise<void> {
  const tagNames = ['Party Guest', `${hostName}'s Party`];

  for (const tagName of tagNames) {
    // Find or create tag
    let tagId: string | null = null;

    const { data: existingTag } = await supabase
      .from('tags')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('name', tagName)
      .single();

    if (existingTag) {
      tagId = existingTag.id;
    } else {
      const { data: created } = await supabase
        .from('tags')
        .insert({ tenant_id: tenantId, name: tagName, color: '#C07850', auto_apply: false })
        .select('id')
        .single();
      tagId = created?.id || null;
    }

    if (!tagId) continue;

    // Check if already assigned
    const { data: existing } = await supabase
      .from('client_tag_assignments')
      .select('id')
      .eq('client_id', clientId)
      .eq('tag_id', tagId)
      .single();

    if (!existing) {
      await supabase.from('client_tag_assignments').insert({
        client_id: clientId,
        tag_id: tagId,
      });
    }
  }
}
