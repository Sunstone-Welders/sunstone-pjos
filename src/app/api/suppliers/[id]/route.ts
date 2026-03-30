// ============================================================================
// Supplier Detail API — src/app/api/suppliers/[id]/route.ts
// ============================================================================
// PATCH to update supplier details.
// DELETE to remove (blocked for is_sunstone=true).
// Uses service role client for writes to bypass RLS.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase, createServiceRoleClient } from '@/lib/supabase/server';

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
  if (body.contact_name !== undefined) updates.contact_name = body.contact_name || null;
  if (body.contact_email !== undefined) updates.contact_email = body.contact_email || null;
  if (body.contact_phone !== undefined) updates.contact_phone = body.contact_phone || null;
  if (body.website !== undefined) {
    let w = body.website?.trim() || null;
    if (w && !/^https?:\/\//i.test(w)) w = `https://${w}`;
    updates.website = w;
  }
  if (body.notes !== undefined) updates.notes = body.notes || null;
  updates.updated_at = new Date().toISOString();

  const admin = await createServiceRoleClient();
  const { data, error } = await admin
    .from('suppliers')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('[Suppliers PATCH] Update error:', error.message, error.code);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
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

  const admin = await createServiceRoleClient();

  // Check if this is the Sunstone supplier
  const { data: supplier } = await admin
    .from('suppliers')
    .select('is_sunstone')
    .eq('id', id)
    .single();

  if (supplier?.is_sunstone) {
    return NextResponse.json(
      { error: 'Sunstone cannot be deleted' },
      { status: 403 }
    );
  }

  const { error } = await admin
    .from('suppliers')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('[Suppliers DELETE] Delete error:', error.message, error.code);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
