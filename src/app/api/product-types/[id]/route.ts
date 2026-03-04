// ============================================================================
// Product Type Detail API — src/app/api/product-types/[id]/route.ts
// ============================================================================
// PATCH to update name/default_inches/sort_order/is_active.
// DELETE to remove (blocked for is_default=true product types).
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

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
  if (body.default_inches !== undefined) updates.default_inches = Number(body.default_inches);
  if (body.sort_order !== undefined) updates.sort_order = body.sort_order;
  if (body.is_active !== undefined) updates.is_active = body.is_active;
  updates.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from('product_types')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'A product type with this name already exists' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
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

  // Check if this is a default product type
  const { data: pt } = await supabase
    .from('product_types')
    .select('is_default')
    .eq('id', id)
    .single();

  if (pt?.is_default) {
    return NextResponse.json(
      { error: 'Default product types cannot be deleted' },
      { status: 403 }
    );
  }

  // Check if any chain_product_prices reference this type
  const { data: refs } = await supabase
    .from('chain_product_prices')
    .select('id')
    .eq('product_type_id', id)
    .limit(1);

  if (refs && refs.length > 0) {
    return NextResponse.json(
      { error: 'This product type is used by one or more chains. Remove those price configurations first.' },
      { status: 409 }
    );
  }

  const { error } = await supabase
    .from('product_types')
    .delete()
    .eq('id', id);

  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  return NextResponse.json({ success: true });
}
