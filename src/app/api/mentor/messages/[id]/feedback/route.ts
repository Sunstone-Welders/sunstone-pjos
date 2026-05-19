// PATCH /api/mentor/messages/[id]/feedback — set thumbs_up or thumbs_down on a Sunny message

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase, createServiceRoleClient } from '@/lib/supabase/server';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: messageId } = await params;

    const supabase = await createServerSupabase();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await request.json();
    const { feedback } = body as { feedback: 'thumbs_up' | 'thumbs_down' };
    if (!feedback || !['thumbs_up', 'thumbs_down'].includes(feedback)) {
      return NextResponse.json({ error: 'Invalid feedback value' }, { status: 400 });
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

    // Verify message belongs to this tenant
    const { data: message } = await serviceClient
      .from('sunny_messages')
      .select('id, tenant_id')
      .eq('id', messageId)
      .eq('tenant_id', membership.tenant_id)
      .single();

    if (!message) {
      return NextResponse.json({ error: 'Message not found' }, { status: 404 });
    }

    // Update feedback
    const { error: updateError } = await serviceClient
      .from('sunny_messages')
      .update({ feedback })
      .eq('id', messageId);

    if (updateError) {
      console.error('[Feedback] Update error:', updateError);
      return NextResponse.json({ error: 'Failed to update feedback' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[Feedback] Route error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
