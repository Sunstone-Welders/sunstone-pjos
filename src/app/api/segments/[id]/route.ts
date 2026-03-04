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

  const { data: segment, error } = await supabase
    .from('client_segments')
    .select('*')
    .eq('id', id)
    .single();

  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  if (!segment) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Count matching clients based on filter_criteria (tag IDs)
  const tagIds: string[] = segment.filter_criteria?.tagIds || [];
  let matchCount = 0;

  if (tagIds.length > 0) {
    // Get clients who have ALL the specified tags
    const { data: assignments } = await supabase
      .from('client_tag_assignments')
      .select('client_id, tag_id')
      .in('tag_id', tagIds);

    if (assignments) {
      const clientTagCounts: Record<string, number> = {};
      for (const a of assignments) {
        clientTagCounts[a.client_id] = (clientTagCounts[a.client_id] || 0) + 1;
      }
      matchCount = Object.values(clientTagCounts).filter((c) => c >= tagIds.length).length;
    }
  } else {
    // No tag filter — count all clients for this tenant
    const { count } = await supabase
      .from('clients')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', segment.tenant_id);
    matchCount = count || 0;
  }

  return NextResponse.json({ ...segment, match_count: matchCount });
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
  if (body.description !== undefined) updates.description = body.description || null;
  if (body.filter_criteria !== undefined) updates.filter_criteria = body.filter_criteria;
  updates.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from('client_segments')
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

  const { error } = await supabase
    .from('client_segments')
    .delete()
    .eq('id', id);

  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  return NextResponse.json({ success: true });
}
