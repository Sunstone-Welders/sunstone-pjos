// ============================================================================
// Product Types API — src/app/api/product-types/route.ts
// ============================================================================
// CRUD for product_types table. GET returns all for tenant. POST creates new.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const tenantId = request.nextUrl.searchParams.get('tenantId');
  if (!tenantId) return NextResponse.json({ error: 'tenantId required' }, { status: 400 });

  const { data, error } = await supabase
    .from('product_types')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('sort_order');

  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { tenant_id, name, default_inches } = body;

  if (!tenant_id || !name || !default_inches) {
    return NextResponse.json({ error: 'tenant_id, name, and default_inches required' }, { status: 400 });
  }

  // Get next sort_order
  const { data: existing } = await supabase
    .from('product_types')
    .select('sort_order')
    .eq('tenant_id', tenant_id)
    .order('sort_order', { ascending: false })
    .limit(1);

  const nextSort = existing && existing.length > 0 ? existing[0].sort_order + 1 : 1;

  const { data, error } = await supabase
    .from('product_types')
    .insert({
      tenant_id,
      name: name.trim(),
      default_inches: Number(default_inches),
      sort_order: nextSort,
      is_default: false,
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'A product type with this name already exists' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
