// src/app/api/admin/broadcast/route.ts
// POST: Send broadcast messages from admin to tenant owners
// Supports SMS (Twilio) and Email (Resend) channels

import { NextRequest, NextResponse } from 'next/server';
import { verifyPlatformAdmin, AdminAuthError } from '@/lib/admin/verify-platform-admin';
import { createServiceRoleClient } from '@/lib/supabase/server';

interface BroadcastBody {
  channel: 'sms' | 'email';
  subject?: string;
  body: string;
  audience: {
    tier?: string;
    status?: string;
    tenantIds?: string[];
  };
}

export async function POST(request: NextRequest) {
  try {
    await verifyPlatformAdmin();
    const serviceClient = await createServiceRoleClient();
    const payload: BroadcastBody = await request.json();

    if (!payload.body || !payload.channel) {
      return NextResponse.json({ error: 'Missing channel or body' }, { status: 400 });
    }

    // Build tenant query
    let query = serviceClient
      .from('tenants')
      .select('id, name, owner_id, subscription_tier, subscription_status')
      .eq('is_suspended', false);

    if (payload.audience.tenantIds && payload.audience.tenantIds.length > 0) {
      query = query.in('id', payload.audience.tenantIds);
    } else {
      if (payload.audience.tier && payload.audience.tier !== 'all') {
        // Map 'free' to 'starter' for consistency
        const tierValue = payload.audience.tier === 'free' ? 'starter' : payload.audience.tier;
        query = query.eq('subscription_tier', tierValue);
      }
      if (payload.audience.status) {
        if (payload.audience.status === 'trial') {
          query = query.eq('subscription_status', 'trialing');
        } else if (payload.audience.status === 'active') {
          query = query.eq('subscription_status', 'active');
        } else if (payload.audience.status === 'past_due') {
          query = query.eq('subscription_status', 'past_due');
        }
      }
    }

    const { data: tenants, error: tenantsErr } = await query;
    if (tenantsErr) {
      return NextResponse.json({ error: 'Failed to query tenants' }, { status: 500 });
    }

    if (!tenants || tenants.length === 0) {
      return NextResponse.json({ sent: 0, error: 'No tenants match the audience filter' }, { status: 400 });
    }

    // Resolve owner contact info
    const ownerIds = [...new Set(tenants.map((t) => t.owner_id))];
    const { data: { users }, error: usersErr } = await serviceClient.auth.admin.listUsers({ perPage: 1000 });
    if (usersErr) {
      return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
    }

    const userMap = new Map<string, { email?: string; phone?: string }>();
    for (const u of users || []) {
      userMap.set(u.id, { email: u.email, phone: u.phone });
    }

    let sentCount = 0;
    const errors: string[] = [];

    for (const tenant of tenants) {
      const owner = userMap.get(tenant.owner_id);
      if (!owner) continue;

      // Resolve template variables
      const tierLabel = tenant.subscription_tier === 'starter' ? 'Starter' :
        tenant.subscription_tier.charAt(0).toUpperCase() + tenant.subscription_tier.slice(1);
      const resolvedBody = payload.body
        .replace(/\{\{tenant_name\}\}/g, tenant.name)
        .replace(/\{\{owner_name\}\}/g, owner.email?.split('@')[0] || 'there')
        .replace(/\{\{plan_tier\}\}/g, tierLabel);
      const resolvedSubject = payload.subject
        ? payload.subject
            .replace(/\{\{tenant_name\}\}/g, tenant.name)
            .replace(/\{\{owner_name\}\}/g, owner.email?.split('@')[0] || 'there')
            .replace(/\{\{plan_tier\}\}/g, tierLabel)
        : undefined;

      try {
        if (payload.channel === 'email' && owner.email) {
          if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) continue;
          const { Resend } = await import('resend');
          const resend = new Resend(process.env.RESEND_API_KEY);
          await resend.emails.send({
            from: process.env.RESEND_FROM_EMAIL,
            to: owner.email,
            subject: resolvedSubject || `Message from Sunstone`,
            text: resolvedBody,
          });
          sentCount++;

          // Log to message_log
          await serviceClient.from('message_log').insert({
            tenant_id: tenant.id,
            direction: 'outbound',
            channel: 'email',
            recipient_email: owner.email,
            subject: resolvedSubject,
            body: resolvedBody,
            source: 'admin_broadcast',
            status: 'sent',
          });
        } else if (payload.channel === 'sms' && owner.phone) {
          if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_PHONE_NUMBER) continue;
          const twilio = require('twilio');
          const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
          await client.messages.create({
            body: resolvedBody,
            from: process.env.TWILIO_PHONE_NUMBER,
            to: owner.phone,
          });
          sentCount++;

          // Log to message_log
          await serviceClient.from('message_log').insert({
            tenant_id: tenant.id,
            direction: 'outbound',
            channel: 'sms',
            recipient_phone: owner.phone,
            body: resolvedBody,
            source: 'admin_broadcast',
            status: 'sent',
          });
        }
      } catch (err: any) {
        errors.push(`${tenant.name}: ${err?.message || 'Send failed'}`);
      }
    }

    return NextResponse.json({ sent: sentCount, total: tenants.length, errors: errors.length > 0 ? errors : undefined });
  } catch (err) {
    if (err instanceof AdminAuthError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    console.error('[Admin Broadcast Error]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
