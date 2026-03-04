import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('message_templates')
    .select('*')
    .eq('id', id)
    .single();

  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(data);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const updates: Record<string, any> = {};
  if (body.name !== undefined) updates.name = body.name.trim();
  if (body.channel !== undefined) updates.channel = body.channel;
  if (body.subject !== undefined) updates.subject = body.subject || null;
  if (body.body !== undefined) updates.body = body.body;
  if (body.category !== undefined) updates.category = body.category;
  updates.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from('message_templates')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Prevent deleting default templates
  const { data: template } = await supabase
    .from('message_templates')
    .select('is_default')
    .eq('id', id)
    .single();

  if (template?.is_default) {
    return NextResponse.json({ error: 'Cannot delete default templates' }, { status: 403 });
  }

  const { error } = await supabase
    .from('message_templates')
    .delete()
    .eq('id', id);

  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  return NextResponse.json({ success: true });
}
