// ============================================================================
// Ambassador Lookup — GET /api/ambassador/lookup?code=xxx
// ============================================================================
// Public endpoint: returns display name for a referral code.
// Used by signup page to show "Referred by Sarah J."
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { formatAmbassadorDisplayName } from '@/lib/ambassador-utils';

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  if (!code) {
    return NextResponse.json({ error: 'code required' }, { status: 400 });
  }

  try {
    const supabase = await createServiceRoleClient();
    const { data: ambassador } = await supabase
      .from('ambassadors')
      .select('name, status')
      .eq('referral_code', code.toLowerCase())
      .eq('status', 'active')
      .single();

    if (!ambassador) {
      return NextResponse.json({ displayName: null });
    }

    return NextResponse.json({
      displayName: formatAmbassadorDisplayName(ambassador.name),
    });
  } catch {
    return NextResponse.json({ displayName: null });
  }
}
