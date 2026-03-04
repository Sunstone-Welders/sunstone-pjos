// ============================================================================
// Tutorials API — GET/POST /api/tutorials
// ============================================================================
// GET: Return all tutorial_progress for current user + tenant
// POST: Upsert with completed: true, completed_at: now
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = await createServerSupabase();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: member } = await supabase
      .from('tenant_members')
      .select('tenant_id')
      .eq('user_id', user.id)
      .not('accepted_at', 'is', null)
      .limit(1)
      .single();

    if (!member) {
      return NextResponse.json({ error: 'No tenant found' }, { status: 404 });
    }

    const { data: progress, error: fetchError } = await supabase
      .from('tutorial_progress')
      .select('*')
      .eq('user_id', user.id)
      .eq('tenant_id', member.tenant_id);

    if (fetchError) {
      return NextResponse.json({ error: 'Failed to load tutorial progress' }, { status: 500 });
    }

    return NextResponse.json({ progress: progress || [] });
  } catch (error: any) {
    console.error('Tutorials GET error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabase();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: member } = await supabase
      .from('tenant_members')
      .select('tenant_id')
      .eq('user_id', user.id)
      .not('accepted_at', 'is', null)
      .limit(1)
      .single();

    if (!member) {
      return NextResponse.json({ error: 'No tenant found' }, { status: 404 });
    }

    const { page_key } = await request.json();
    if (!page_key) {
      return NextResponse.json({ error: 'Missing page_key' }, { status: 400 });
    }

    const { error: upsertError } = await supabase
      .from('tutorial_progress')
      .upsert(
        {
          user_id: user.id,
          tenant_id: member.tenant_id,
          page_key,
          completed: true,
          completed_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,tenant_id,page_key' }
      );

    if (upsertError) {
      return NextResponse.json({ error: 'Failed to save tutorial progress' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Tutorials POST error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
