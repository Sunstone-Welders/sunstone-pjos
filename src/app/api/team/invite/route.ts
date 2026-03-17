// ============================================================================
// Team Invite API — GATED — src/app/api/team/invite/route.ts
// ============================================================================
// POST: Invite a new team member (admin only)
// GATE: Starter = max 1 (owner only), Pro = max 3, Business = unlimited
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase, createServiceRoleClient } from '@/lib/supabase/server';
import { hasPermission, type TenantRole } from '@/lib/permissions';
import { getSubscriptionTier } from '@/lib/subscription';

// Team member limits by tier
const TEAM_MEMBER_LIMITS: Record<string, number> = {
  starter: 1,
  pro: 3,
  business: Infinity,
};

export async function POST(request: NextRequest) {
  try {
    // Authenticate via user-scoped client
    const supabase = await createServerSupabase();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Use service role to bypass RLS for membership lookup
    const serviceClient = await createServiceRoleClient();

    // Get caller's membership and tenant
    const { data: callerMember, error: memberError } = await serviceClient
      .from('tenant_members')
      .select('*, tenants(owner_id, name, subscription_tier, subscription_status, trial_ends_at)')
      .eq('user_id', user.id)
      .limit(1)
      .single();

    if (memberError || !callerMember) {
      console.error('Caller membership lookup failed:', memberError);
      return NextResponse.json({ error: 'No tenant membership found' }, { status: 403 });
    }

    const tenant = (callerMember as any).tenants;
    const isOwner = tenant.owner_id === user.id;
    const callerRole = isOwner ? 'admin' : (callerMember.role as TenantRole);

    // Permission check: must have team:manage
    if (!isOwner && !hasPermission(callerRole, 'team:manage')) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    // ── SUBSCRIPTION GATE — enforce team member limits by tier ──
    const effectiveTier = getSubscriptionTier(tenant);
    const memberLimit = TEAM_MEMBER_LIMITS[effectiveTier] || 1;

    // Count current team members (including pending)
    const { count: currentMemberCount } = await serviceClient
      .from('tenant_members')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', callerMember.tenant_id);

    const currentCount = currentMemberCount || 0;

    if (currentCount >= memberLimit) {
      if (effectiveTier === 'starter') {
        return NextResponse.json(
          { error: 'Starter plan is limited to 1 team member (owner only). Upgrade to Pro to add team members.' },
          { status: 403 }
        );
      }
      if (effectiveTier === 'pro') {
        return NextResponse.json(
          { error: `Pro plan is limited to ${memberLimit} team members. Upgrade to Business for unlimited team members.` },
          { status: 403 }
        );
      }
    }

    // Parse request body
    const body = await request.json();
    const { email, role, display_name } = body as {
      email: string;
      role: TenantRole;
      display_name?: string;
    };

    // Validate
    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'Valid email is required' }, { status: 400 });
    }

    if (!role || !['staff', 'manager', 'admin'].includes(role)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Check if member already exists for this tenant
    const { data: existing } = await serviceClient
      .from('tenant_members')
      .select('id, accepted_at, invited_email')
      .eq('tenant_id', callerMember.tenant_id)
      .eq('invited_email', normalizedEmail)
      .maybeSingle();

    if (existing) {
      if (existing.accepted_at) {
        return NextResponse.json(
          { error: 'This person is already a team member' },
          { status: 409 }
        );
      }
      // Re-send: update role and timestamp on the pending invite
      await serviceClient
        .from('tenant_members')
        .update({
          role,
          display_name: display_name || existing.invited_email,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);

      // Try to send email (non-blocking)
      await trySendInviteEmail({
        to: normalizedEmail,
        tenantName: tenant.name || 'Sunstone',
        role,
        displayName: display_name,
      });

      return NextResponse.json({ message: 'Invite resent successfully' });
    }

    // Check if user already has a Supabase account
    const { data: existingUser } = await serviceClient.auth.admin.listUsers();
    const matchedUser = existingUser?.users?.find(
      (u) => u.email?.toLowerCase() === normalizedEmail
    );

    if (matchedUser) {
      // Check if they're already a member by user_id
      const { data: memberByUserId } = await serviceClient
        .from('tenant_members')
        .select('id')
        .eq('tenant_id', callerMember.tenant_id)
        .eq('user_id', matchedUser.id)
        .maybeSingle();

      if (memberByUserId) {
        return NextResponse.json(
          { error: 'This person is already a team member' },
          { status: 409 }
        );
      }
    }

    // Create pending invite record
    const { error: insertError } = await serviceClient
      .from('tenant_members')
      .insert({
        tenant_id: callerMember.tenant_id,
        user_id: matchedUser?.id || null,
        role,
        display_name: display_name || null,
        invited_email: normalizedEmail,
        accepted_at: matchedUser ? new Date().toISOString() : null,
      });

    if (insertError) {
      console.error('Insert invite error:', insertError);
      return NextResponse.json({ error: 'Failed to create invite' }, { status: 500 });
    }

    // Try to send email (non-blocking)
    await trySendInviteEmail({
      to: normalizedEmail,
      tenantName: tenant.name || 'Sunstone',
      role,
      displayName: display_name,
    });

    const message = matchedUser
      ? 'Team member added successfully (existing account found)'
      : 'Invite sent! They\'ll be added when they sign up.';

    return NextResponse.json({ message });
  } catch (err) {
    console.error('Team invite error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ============================================================================
// Email helper — gracefully handles missing Resend config
// ============================================================================

async function trySendInviteEmail(params: {
  to: string;
  tenantName: string;
  role: string;
  displayName?: string;
}) {
  const resendApiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL || 'noreply@sunstone.app';

  if (!resendApiKey) {
    console.log('RESEND_API_KEY not set — skipping invite email to', params.to);
    return;
  }

  try {
    const { Resend } = await import('resend');
    const resend = new Resend(resendApiKey);

    const signupUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/auth/signup`;

    await resend.emails.send({
      from: `${params.tenantName} via Sunstone <${fromEmail}>`,
      to: params.to,
      subject: `You've been invited to join ${params.tenantName} on Sunstone`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
          <h2 style="color: #1a1a1a; margin-bottom: 16px;">You're invited!</h2>
          <p style="color: #555; line-height: 1.6;">
            ${params.displayName ? `Hi ${params.displayName},` : 'Hi there,'}<br/><br/>
            You've been invited to join <strong>${params.tenantName}</strong> on Sunstone as a <strong>${params.role}</strong>.
          </p>
          <p style="color: #555; line-height: 1.6;">
            Sign up with this email address (<strong>${params.to}</strong>) and you'll automatically be connected to the team.
          </p>
          <a href="${signupUrl}" style="display: inline-block; background: #7A234A; color: white; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: 600; margin-top: 16px;">
            Sign Up Now
          </a>
          <p style="color: #999; font-size: 13px; margin-top: 32px;">
            If you didn't expect this invite, you can safely ignore this email.
          </p>
        </div>
      `,
    });

    console.log('Invite email sent to', params.to);
  } catch (err) {
    console.warn('Failed to send invite email:', err);
  }
}