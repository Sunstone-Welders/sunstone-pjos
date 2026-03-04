// src/app/api/clients/[id]/notes/route.ts
// GET: List notes for a client
// POST: Create a new note
// DELETE: Delete a note

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: clientId } = await params;
  const tenantId = request.nextUrl.searchParams.get('tenantId');
  if (!tenantId) return NextResponse.json({ error: 'tenantId required' }, { status: 400 });

  const { data, error } = await supabase
    .from('client_notes')
    .select('*')
    .eq('client_id', clientId)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  return NextResponse.json(data || []);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: clientId } = await params;
  const body = await request.json();

  if (!body.tenantId || !body.body) {
    return NextResponse.json({ error: 'tenantId and body are required' }, { status: 400 });
  }
  if (body.body.length > 500) {
    return NextResponse.json({ error: 'Note must be 500 characters or less' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('client_notes')
    .insert({
      tenant_id: body.tenantId,
      client_id: clientId,
      body: body.body,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  if (!body.noteId) return NextResponse.json({ error: 'noteId required' }, { status: 400 });

  const { error } = await supabase
    .from('client_notes')
    .delete()
    .eq('id', body.noteId);

  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  return NextResponse.json({ success: true });
}
