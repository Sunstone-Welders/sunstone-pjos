// ============================================================================
// Expenses API — src/app/api/expenses/route.ts
// ============================================================================
// GET:    List expenses with optional filters (startDate, endDate, category, event_id)
// POST:   Create expense
// PUT:    Update expense by ID
// DELETE: Delete expense by ID
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase, createServiceRoleClient } from '@/lib/supabase/server';

async function getTenantId(serviceClient: any, userId: string): Promise<string | null> {
  const { data } = await serviceClient
    .from('tenant_members')
    .select('tenant_id')
    .eq('user_id', userId)
    .limit(1)
    .single();
  return data?.tenant_id || null;
}

// ── GET: List expenses ──
export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const serviceClient = await createServiceRoleClient();
    const tenantId = await getTenantId(serviceClient, user.id);
    if (!tenantId) return NextResponse.json({ error: 'No tenant' }, { status: 403 });

    const { searchParams } = request.nextUrl;
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const category = searchParams.get('category');
    const eventId = searchParams.get('event_id');

    let query = serviceClient
      .from('expenses')
      .select('*, event:events(name)')
      .eq('tenant_id', tenantId)
      .order('date', { ascending: false });

    if (startDate) query = query.gte('date', startDate);
    if (endDate) query = query.lte('date', endDate);
    if (category) query = query.eq('category', category);
    if (eventId) query = query.eq('event_id', eventId);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 });

    return NextResponse.json(data || []);
  } catch (err: any) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ── POST: Create expense ──
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const serviceClient = await createServiceRoleClient();
    const tenantId = await getTenantId(serviceClient, user.id);
    if (!tenantId) return NextResponse.json({ error: 'No tenant' }, { status: 403 });

    const body = await request.json();
    const { name, amount, category, date, event_id, notes, is_recurring, recurring_frequency } = body;

    if (!name || !amount || !category || !date) {
      return NextResponse.json({ error: 'name, amount, category, and date are required' }, { status: 400 });
    }

    const { data, error } = await serviceClient
      .from('expenses')
      .insert({
        tenant_id: tenantId,
        name,
        amount,
        category,
        date,
        event_id: event_id || null,
        notes: notes || null,
        is_recurring: is_recurring || false,
        recurring_frequency: recurring_frequency || null,
        created_by: user.id,
      })
      .select('*, event:events(name)')
      .single();

    if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    return NextResponse.json(data, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ── PUT: Update expense ──
export async function PUT(request: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const serviceClient = await createServiceRoleClient();
    const tenantId = await getTenantId(serviceClient, user.id);
    if (!tenantId) return NextResponse.json({ error: 'No tenant' }, { status: 403 });

    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

    const { data, error } = await serviceClient
      .from('expenses')
      .update(updates)
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .select('*, event:events(name)')
      .single();

    if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ── DELETE: Delete expense ──
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const serviceClient = await createServiceRoleClient();
    const tenantId = await getTenantId(serviceClient, user.id);
    if (!tenantId) return NextResponse.json({ error: 'No tenant' }, { status: 403 });

    const { searchParams } = request.nextUrl;
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

    const { error } = await serviceClient
      .from('expenses')
      .delete()
      .eq('id', id)
      .eq('tenant_id', tenantId);

    if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
