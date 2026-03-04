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

  const { data: broadcast, error } = await supabase
    .from('broadcasts')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    console.error('Broadcast GET error:', error);
    return NextResponse.json({ error: 'Failed to load broadcast' }, { status: 500 });
  }
  if (!broadcast) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Get message log
  const { data: messages } = await supabase
    .from('broadcast_messages')
    .select('*')
    .eq('broadcast_id', id)
    .order('created_at');

  return NextResponse.json({ ...broadcast, messages: messages || [] });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { error } = await supabase
    .from('broadcasts')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Broadcast DELETE error:', error);
    return NextResponse.json({ error: 'Failed to delete broadcast' }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
