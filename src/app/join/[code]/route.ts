// ============================================================================
// Join Redirect — src/app/join/[code]/route.ts
// ============================================================================
// Handles /join/[code] — validates referral code, sets cookie, creates
// referral click record, and redirects to signup with ?ref= param.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const signupUrl = new URL('/auth/signup', request.url);

  try {
    const supabase = await createServiceRoleClient();

    // Look up ambassador by referral code — must be active
    const { data: ambassador } = await supabase
      .from('ambassadors')
      .select('id, referral_code, status')
      .eq('referral_code', code.toLowerCase())
      .eq('status', 'active')
      .single();

    if (!ambassador) {
      // Invalid or inactive code — silently redirect to signup
      return NextResponse.redirect(signupUrl);
    }

    // Create referral click record
    await supabase.from('referrals').insert({
      ambassador_id: ambassador.id,
      referral_code_used: code.toLowerCase(),
      attribution_source: 'link_click',
      status: 'clicked',
      cookie_set_at: new Date().toISOString(),
    });

    // Redirect to signup with ref param
    signupUrl.searchParams.set('ref', code.toLowerCase());
    const response = NextResponse.redirect(signupUrl);

    // Set referral cookie (30 days, readable by JS on signup page)
    response.cookies.set('referral_code', code.toLowerCase(), {
      path: '/',
      maxAge: 30 * 24 * 60 * 60, // 30 days
      httpOnly: false, // JS needs to read it on signup
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    });

    return response;
  } catch (error) {
    console.error('[Join] Error processing referral:', error);
    return NextResponse.redirect(signupUrl);
  }
}
