// src/app/api/admin/tenants/[id]/notes/route.ts
// GET: List admin notes for a tenant
// POST: Create a new admin note
// DELETE: Delete an admin note

import { NextRequest, NextResponse } from 'next/server';
import { verifyPlatformAdmin, AdminAuthError } from '@/lib/admin/verify-platform-admin';
import { createServiceRoleClient } from '@/lib/supabase/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await verifyPlatformAdmin();
    const { id: tenantId } = await params;
    const serviceClient = await createServiceRoleClient();

    const { data, error } = await serviceClient
      .from('admin_notes')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });

    if (error) return NextResponse.json({ error: 'Failed to fetch notes' }, { status: 500 });
    return NextResponse.json(data || []);
  } catch (err) {
    if (err instanceof AdminAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await verifyPlatformAdmin();
    const { id: tenantId } = await params;
    const serviceClient = await createServiceRoleClient();
    const body = await request.json();

    if (!body.body || body.body.length > 500) {
      return NextResponse.json({ error: 'Note body required (max 500 chars)' }, { status: 400 });
    }

    const { data, error } = await serviceClient
      .from('admin_notes')
      .insert({
        tenant_id: tenantId,
        body: body.body,
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: 'Failed to create note' }, { status: 500 });
    return NextResponse.json(data);
  } catch (err) {
    if (err instanceof AdminAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await verifyPlatformAdmin();
    const serviceClient = await createServiceRoleClient();
    const body = await request.json();

    if (!body.noteId) return NextResponse.json({ error: 'noteId required' }, { status: 400 });

    const { error } = await serviceClient
      .from('admin_notes')
      .delete()
      .eq('id', body.noteId);

    if (error) return NextResponse.json({ error: 'Failed to delete note' }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof AdminAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
