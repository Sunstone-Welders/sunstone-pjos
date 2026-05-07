// ============================================================================
// Atlas SMS — Account Concierge Over Text
// ============================================================================
// Handles inbound SMS to the Atlas dedicated number. Looks up the sender's
// tenant account, gathers context, calls Claude for a response, and replies.
// Escalates to Tony when the AI can't help.
// ============================================================================

import Anthropic from '@anthropic-ai/sdk';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { normalizePhone, normalizePhoneDigits, sendSMS } from '@/lib/twilio';
import { logAnthropicCost, logSmsCost } from '@/lib/cost-tracker';
import { getSubscriptionTier, isTrialActive, getTrialDaysRemaining } from '@/lib/subscription';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
const ATLAS_MODEL = 'claude-sonnet-4-20250514';

// ============================================================================
// Main Handler
// ============================================================================

export async function handleAtlasInbound(phone: string, messageBody: string) {
  const supabase = await createServiceRoleClient();
  const normalizedPhone = normalizePhone(phone);
  const last10 = normalizePhoneDigits(phone);

  // ------------------------------------------------------------------
  // 1. Look up tenant by phone number
  // ------------------------------------------------------------------
  let tenant: any = null;
  let userId: string | null = null;

  // Check tenants.phone
  const { data: tenantByPhone } = await supabase
    .from('tenants')
    .select('id, owner_id, name, subscription_tier, subscription_status, trial_ends_at, subscription_period_end, crm_enabled, phone_verified, admin_tier_override, created_at, phone')
    .ilike('phone', `%${last10.slice(-10)}%`)
    .limit(5);

  if (tenantByPhone && tenantByPhone.length > 0) {
    // Find exact match by normalized digits
    tenant = tenantByPhone.find(t => {
      if (!t.phone) return false;
      return normalizePhoneDigits(t.phone) === last10;
    }) || tenantByPhone[0];
    userId = tenant.owner_id;
  }

  // If not found, check auth user metadata phone
  if (!tenant) {
    const { data: users } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    if (users?.users) {
      const matchedUser = users.users.find(u => {
        const userPhone = u.phone || u.user_metadata?.phone || '';
        return userPhone && normalizePhoneDigits(userPhone) === last10;
      });
      if (matchedUser) {
        userId = matchedUser.id;
        const { data: tenantByOwner } = await supabase
          .from('tenants')
          .select('id, owner_id, name, subscription_tier, subscription_status, trial_ends_at, subscription_period_end, crm_enabled, phone_verified, admin_tier_override, created_at, phone')
          .eq('owner_id', matchedUser.id)
          .single();
        if (tenantByOwner) tenant = tenantByOwner;
      }
    }
  }

  // Last resort: check sms_verification_codes table
  if (!tenant) {
    const { data: codeMatch } = await supabase
      .from('sms_verification_codes')
      .select('user_id')
      .eq('phone', normalizedPhone)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (codeMatch?.user_id) {
      userId = codeMatch.user_id;
      const { data: tenantByOwner } = await supabase
        .from('tenants')
        .select('id, owner_id, name, subscription_tier, subscription_status, trial_ends_at, subscription_period_end, crm_enabled, phone_verified, admin_tier_override, created_at, phone')
        .eq('owner_id', codeMatch.user_id)
        .single();
      if (tenantByOwner) tenant = tenantByOwner;
    }
  }

  // No account found — send generic response
  if (!tenant) {
    const noAccountMsg = "Hi! I'm Atlas, the Sunstone Studio account assistant. I couldn't find an account linked to this number. If you have a Sunstone Studio account, please text from the phone number you used to sign up, or log in at sunstonepj.app for help.";
    await sendAtlasSMS(normalizedPhone, noAccountMsg);
    await storeMessages(supabase, null, null, normalizedPhone, messageBody, noAccountMsg, false);
    return;
  }

  // ------------------------------------------------------------------
  // 2. Gather account context
  // ------------------------------------------------------------------
  const effectiveTier = getSubscriptionTier(tenant);
  const trialActive = isTrialActive(tenant);
  const trialDays = getTrialDaysRemaining(tenant);

  // Team member count
  const { count: teamCount } = await supabase
    .from('tenant_members')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenant.id);

  // Sales in last 30 days
  let salesCount = 0;
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { count: recentSales } = await supabase
    .from('sales')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenant.id)
    .gte('created_at', thirtyDaysAgo);
  salesCount = recentSales || 0;

  // Ambassador check
  const { data: ambassador } = await supabase
    .from('ambassadors')
    .select('id')
    .eq('tenant_id', tenant.id)
    .limit(1)
    .single();
  const isAmbassador = !!ambassador;

  // ------------------------------------------------------------------
  // 3. Get conversation history
  // ------------------------------------------------------------------
  const { data: history } = await supabase
    .from('atlas_sms_messages')
    .select('direction, message, created_at')
    .eq('phone', normalizedPhone)
    .order('created_at', { ascending: false })
    .limit(6);

  const conversationHistory = (history || [])
    .reverse()
    .map((m: any) => ({
      role: m.direction === 'inbound' ? 'user' as const : 'assistant' as const,
      content: m.message,
    }));

  // ------------------------------------------------------------------
  // 4. Call Anthropic
  // ------------------------------------------------------------------
  const paymentStatus = tenant.subscription_status || 'none';
  const trialInfo = trialActive
    ? `Trialing (${trialDays} days remaining, ends ${new Date(tenant.trial_ends_at).toLocaleDateString()})`
    : 'N/A';

  const systemPrompt = `You are Atlas, the Sunstone Studio account assistant. You help permanent jewelry artists with account questions via text message.

CURRENT ACCOUNT INFO:
- Business: ${tenant.name || 'Unknown'}
- Plan: ${effectiveTier} (${paymentStatus})
- Trial: ${trialInfo}
- CRM add-on: ${tenant.crm_enabled ? 'Active' : 'Not active'}
- Team members: ${teamCount || 0}
- Sales (last 30 days): ${salesCount}
- Ambassador: ${isAmbassador ? 'Yes' : 'No'}
- Account created: ${new Date(tenant.created_at).toLocaleDateString()}

WHAT YOU CAN DO:
- Answer questions about their plan, trial status, payment status, and features
- Send links to take action (see LINKS below)
- Explain what each plan includes (Starter $99/mo, Pro $169/mo, Business $279/mo)
- Explain the CRM add-on ($69/mo) — what it includes (dedicated phone number, two-way SMS, client messaging)
- Confirm their trial length and when it ends
- Help them understand what happens when their trial ends

LINKS YOU CAN SEND (include the full URL when relevant):
- Upgrade subscription or activate account: https://sunstonepj.app/dashboard/settings
- Dashboard: https://sunstonepj.app/dashboard
- Log in: https://sunstonepj.app/auth/login
- Support email: support@sunstonepj.app

RULES:
- Keep responses SHORT. This is SMS — 2-3 sentences max. No bullet points, no formatting.
- Be warm and helpful, like a knowledgeable friend, not a robot.
- If they ask about welding, chains, inventory, or business strategy, tell them: "That's a great question for Sunny, your in-app AI mentor! Open Sunstone Studio and tap the Sunny chat button."
- If they seem frustrated, confused about something you can't resolve, or ask to talk to a person, respond helpfully but include: "I'm going to connect you with Tony from our team — he'll text you shortly." Then set escalate=true.
- If they ask anything you genuinely don't know or that requires making changes to their account, escalate.
- Never make up information. If you're not sure about their account status, say so and suggest they check their dashboard.
- Never mention competitors by name.
- Do not process payments, change plans, or modify their account. Only send them links to do it themselves.`;

  const messages: { role: 'user' | 'assistant'; content: string }[] = [
    ...conversationHistory,
    { role: 'user', content: messageBody },
  ];

  const response = await anthropic.messages.create({
    model: ATLAS_MODEL,
    max_tokens: 300,
    system: systemPrompt,
    messages,
  });

  const reply = response.content[0]?.type === 'text' ? response.content[0].text.trim() : '';
  if (!reply) return;

  // ------------------------------------------------------------------
  // 5. Check for escalation
  // ------------------------------------------------------------------
  const escalated = /connect you with Tony/i.test(reply) || /I'm going to connect/i.test(reply);

  // ------------------------------------------------------------------
  // 6. Store messages
  // ------------------------------------------------------------------
  await storeMessages(supabase, tenant.id, userId, normalizedPhone, messageBody, reply, escalated);

  // ------------------------------------------------------------------
  // 7. Send the response
  // ------------------------------------------------------------------
  await sendAtlasSMS(normalizedPhone, reply);

  // ------------------------------------------------------------------
  // 8. Escalation notification
  // ------------------------------------------------------------------
  if (escalated) {
    const escalationPhone = process.env.ATLAS_ESCALATION_PHONE || '+18014009693';
    const escalationMsg = `Atlas escalation from ${tenant.name || 'Unknown'} (${normalizedPhone}): ${messageBody}`;
    await sendAtlasSMS(escalationPhone, escalationMsg);
  }

  // ------------------------------------------------------------------
  // Cost tracking
  // ------------------------------------------------------------------
  logSmsCost({ tenantId: tenant.id, operation: 'atlas_sms_outbound' });
  logAnthropicCost({
    tenantId: tenant.id,
    operation: 'atlas_sms',
    model: ATLAS_MODEL,
    usage: response.usage,
  });
}

// ============================================================================
// Helpers
// ============================================================================

async function sendAtlasSMS(to: string, body: string) {
  const atlasNumber = process.env.ATLAS_PHONE_NUMBER;

  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
    console.log(`[Atlas SMS Skipped] Would send to ${to}: ${body.slice(0, 80)}`);
    return;
  }

  const twilio = require('twilio');
  const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

  const messageParams: Record<string, string> = {
    body,
    to: normalizePhone(to),
  };

  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;
  if (messagingServiceSid) {
    messageParams.messagingServiceSid = messagingServiceSid;
    if (atlasNumber) messageParams.from = atlasNumber;
  } else if (atlasNumber) {
    messageParams.from = atlasNumber;
  } else if (process.env.TWILIO_PHONE_NUMBER) {
    messageParams.from = process.env.TWILIO_PHONE_NUMBER;
  }

  await client.messages.create(messageParams);
}

async function storeMessages(
  supabase: any,
  tenantId: string | null,
  userId: string | null,
  phone: string,
  inboundBody: string,
  outboundBody: string,
  escalated: boolean
) {
  await supabase.from('atlas_sms_messages').insert([
    {
      tenant_id: tenantId,
      user_id: userId,
      phone,
      direction: 'inbound',
      message: inboundBody,
      escalated: false,
    },
    {
      tenant_id: tenantId,
      user_id: userId,
      phone,
      direction: 'outbound',
      message: outboundBody,
      escalated,
    },
  ]);
}
