// ============================================================================
// External Ambassador Signup — POST /api/ambassador/signup
// ============================================================================
// Creates an external ambassador application (status: pending).
// Generates a referral code and creates/links auth user.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateReferralCode, generateUniqueReferralCode } from '@/lib/ambassador-utils';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, email, phone, community_description, social_links } = body;

    if (!name?.trim() || !email?.trim() || !community_description?.trim()) {
      return NextResponse.json(
        { error: 'Name, email, and community description are required' },
        { status: 400 }
      );
    }

    const supabase = await createServiceRoleClient();

    // Check if already registered as ambassador
    const { data: existing } = await supabase
      .from('ambassadors')
      .select('id, status')
      .eq('email', email.toLowerCase().trim())
      .single();

    if (existing) {
      return NextResponse.json(
        { error: 'This email is already registered as an ambassador' },
        { status: 409 }
      );
    }

    // Create auth user if needed (or find existing)
    let userId: string | null = null;
    const { data: existingUsers } = await supabase.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find(
      (u) => u.email?.toLowerCase() === email.toLowerCase().trim()
    );

    if (existingUser) {
      userId = existingUser.id;
    } else {
      // Create a new auth user with a random password (they'll use password reset)
      const tempPassword = crypto.randomUUID() + 'Aa1!';
      const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
        email: email.toLowerCase().trim(),
        password: tempPassword,
        email_confirm: true,
        user_metadata: { full_name: name.trim(), ambassador: true },
      });

      if (createError) {
        console.error('[Ambassador Signup] Auth user creation failed:', createError);
        return NextResponse.json(
          { error: 'Failed to create account' },
          { status: 500 }
        );
      }
      userId = newUser.user.id;
    }

    // Generate referral code — check for collisions
    let referralCode = generateReferralCode(name.trim());
    const { data: codeExists } = await supabase
      .from('ambassadors')
      .select('id')
      .eq('referral_code', referralCode)
      .single();

    if (codeExists) {
      referralCode = generateUniqueReferralCode(name.trim());
    }

    // Create ambassador record
    const { data: ambassador, error: insertError } = await supabase
      .from('ambassadors')
      .insert({
        user_id: userId,
        type: 'external',
        status: 'pending',
        name: name.trim(),
        email: email.toLowerCase().trim(),
        phone: phone?.trim() || null,
        referral_code: referralCode,
        community_description: community_description.trim(),
        social_links: social_links?.trim() || null,
      })
      .select('id, referral_code')
      .single();

    if (insertError) {
      console.error('[Ambassador Signup] Insert failed:', insertError);
      return NextResponse.json(
        { error: 'Failed to submit application' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      ambassadorId: ambassador.id,
      referralCode: ambassador.referral_code,
    }, { status: 201 });
  } catch (error: any) {
    console.error('[Ambassador Signup] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
