// src/app/api/mentor/flag/route.ts
// POST endpoint for flagging a Sunny message as wrong
// Called from the thumbs-down button in MentorChat and text correction detection

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase, createServiceRoleClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    // 1. Auth
    const supabase = await createServerSupabase();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // 2. Get tenant
    const serviceClient = await createServiceRoleClient();
    const { data: membership } = await serviceClient
      .from('tenant_members')
      .select('tenant_id')
      .eq('user_id', user.id)
      .limit(1)
      .single();

    if (!membership?.tenant_id) {
      return NextResponse.json({ error: 'No tenant found' }, { status: 400 });
    }

    // 3. Parse body
    const body = await request.json();
    const {
      flaggedMessage,
      conversationContext,
      userNote,
      source,
      topic,
    } = body as {
      flaggedMessage: string;
      conversationContext?: string;
      userNote?: string;
      source: 'user_thumbs_down' | 'user_text_correction';
      topic?: string;
    };

    if (!flaggedMessage || !source) {
      return NextResponse.json({ error: 'flaggedMessage and source are required' }, { status: 400 });
    }

    if (!['user_thumbs_down', 'user_text_correction'].includes(source)) {
      return NextResponse.json({ error: 'Invalid source type' }, { status: 400 });
    }

    // 4. Insert into mentor_knowledge_gaps
    const { error: insertError } = await serviceClient
      .from('mentor_knowledge_gaps')
      .insert({
        tenant_id: membership.tenant_id,
        user_id: user.id,
        user_message: conversationContext || '(no context)',
        sunny_response: flaggedMessage,
        category: topic || 'other',
        topic: topic || 'other',
        source,
        flagged_message: flaggedMessage,
        user_correction_note: userNote || null,
        conversation_context: conversationContext || null,
        status: 'pending',
      });

    if (insertError) {
      console.error('[Mentor Flag] Insert error:', insertError);
      return NextResponse.json({ error: 'Failed to save flag' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Mentor Flag] Error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
