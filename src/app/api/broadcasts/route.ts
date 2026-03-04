// ============================================================================
// Broadcasts API — src/app/api/broadcasts/route.ts
// ============================================================================
// GET: List broadcasts for the caller's tenant.
// POST: Create a new broadcast draft for the caller's tenant.
// Tenant ID is always derived from the session — never trusted from the client.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

export async function GET() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Derive tenant from session
  const { data: member } = await supabase
    .from('tenant_members')
    .select('tenant_id')
    .eq('user_id', user.id)
    .limit(1)
    .single();

  if (!member) return NextResponse.json({ error: 'No tenant membership' }, { status: 403 });

  const { data, error } = await supabase
    .from('broadcasts')
    .select('*')
    .eq('tenant_id', member.tenant_id)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Broadcasts GET error:', error);
    return NextResponse.json({ error: 'Failed to load broadcasts' }, { status: 500 });
  }
  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Derive tenant from session — ignore body's tenant_id
  const { data: member } = await supabase
    .from('tenant_members')
    .select('tenant_id')
    .eq('user_id', user.id)
    .limit(1)
    .single();

  if (!member) return NextResponse.json({ error: 'No tenant membership' }, { status: 403 });

  const body = await request.json();
  const {
    name, channel, template_id,
    custom_subject, custom_body,
    target_type, target_id, target_name,
  } = body;

  if (!name || !channel || !target_type) {
    return NextResponse.json({ error: 'name, channel, and target_type are required' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('broadcasts')
    .insert({
      tenant_id: member.tenant_id,
      name: name.trim(),
      channel,
      template_id: template_id || null,
      custom_subject: custom_subject || null,
      custom_body: custom_body || null,
      target_type,
      target_id: target_id || null,
      target_name: target_name || null,
      status: 'draft',
    })
    .select()
    .single();

  if (error) {
    console.error('Broadcasts POST error:', error);
    return NextResponse.json({ error: 'Failed to create broadcast' }, { status: 500 });
  }
  return NextResponse.json(data, { status: 201 });
}
