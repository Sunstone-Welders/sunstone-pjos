// GET /api/mentor/conversations — list recent Sunny conversations for the authenticated user's tenant

import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceRoleClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = await createServerSupabase();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const serviceClient = await createServiceRoleClient();

    // Get tenant
    const { data: membership } = await serviceClient
      .from('tenant_members')
      .select('tenant_id')
      .eq('user_id', user.id)
      .limit(1)
      .single();

    if (!membership?.tenant_id) {
      return NextResponse.json({ error: 'No tenant found' }, { status: 400 });
    }

    // Fetch last 20 conversations for this tenant, ordered by most recent
    const { data: conversations, error } = await serviceClient
      .from('sunny_conversations')
      .select('id, title, message_count, updated_at')
      .eq('tenant_id', membership.tenant_id)
      .order('updated_at', { ascending: false })
      .limit(20);

    if (error) {
      console.error('[Conversations] List error:', error);
      return NextResponse.json({ error: 'Failed to fetch conversations' }, { status: 500 });
    }

    return NextResponse.json({ conversations: conversations || [] });
  } catch (err) {
    console.error('[Conversations] Route error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
