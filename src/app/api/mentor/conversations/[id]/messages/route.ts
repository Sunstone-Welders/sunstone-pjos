// GET /api/mentor/conversations/[id]/messages — fetch all messages for a specific conversation

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase, createServiceRoleClient } from '@/lib/supabase/server';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: conversationId } = await params;

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

    // Verify conversation belongs to this tenant
    const { data: conversation } = await serviceClient
      .from('sunny_conversations')
      .select('id, tenant_id')
      .eq('id', conversationId)
      .eq('tenant_id', membership.tenant_id)
      .single();

    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    // Fetch messages
    const { data: messages, error } = await serviceClient
      .from('sunny_messages')
      .select('id, role, content, feedback, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('[Conversations] Messages error:', error);
      return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 });
    }

    return NextResponse.json({ messages: messages || [] });
  } catch (err) {
    console.error('[Conversations] Messages route error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
