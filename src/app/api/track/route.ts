import { createServerSupabase, createServiceRoleClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    // Verify the user is authenticated
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { event_type, event_category, metadata, tenant_id } = await req.json();

    if (!event_type || !tenant_id) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    // Use service role to bypass RLS
    const serviceClient = await createServiceRoleClient();
    await serviceClient.from('usage_events').insert({
      tenant_id,
      user_id: user.id,
      event_type,
      event_category: event_category || 'other',
      metadata: metadata || {},
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Track event error:', error);
    return NextResponse.json({ ok: true }); // Never fail the caller
  }
}
