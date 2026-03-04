// src/app/api/admin/tenants/[id]/route.ts
// GET: Single tenant with full details
// PATCH: Update tenant (plan tier, suspension)

import { NextRequest, NextResponse } from 'next/server';
import { verifyPlatformAdmin, AdminAuthError } from '@/lib/admin/verify-platform-admin';
import { createServiceRoleClient } from '@/lib/supabase/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await verifyPlatformAdmin();
    const { id } = await params;
    const serviceClient = await createServiceRoleClient();

    // Full tenant record
    const { data: tenant, error } = await serviceClient
      .from('tenants')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    // Get owner info
    const { data: { user: owner } } = await serviceClient.auth.admin.getUserById(tenant.owner_id);

    // Get counts
    const [events, inventory, clients, sales, members] = await Promise.all([
      serviceClient.from('events').select('id', { count: 'exact', head: true }).eq('tenant_id', id),
      serviceClient.from('inventory_items').select('id', { count: 'exact', head: true }).eq('tenant_id', id),
      serviceClient.from('clients').select('id', { count: 'exact', head: true }).eq('tenant_id', id),
      serviceClient.from('sales').select('id, total, platform_fee_amount, created_at').eq('tenant_id', id).eq('status', 'completed').order('created_at', { ascending: false }).limit(10),
      serviceClient.from('tenant_members').select('user_id, role, display_name, invited_email, accepted_at').eq('tenant_id', id),
    ]);

    // Calculate total revenue
    const totalRevenue = (sales.data || []).reduce((sum, s) => sum + Number(s.total), 0);

    // Resolve member emails
    const membersList = (members.data || []).map((m: any) => ({
      ...m,
      is_owner: m.user_id === tenant.owner_id,
      email: m.invited_email || null,
    }));

    return NextResponse.json({
      tenant,
      owner: owner ? { id: owner.id, email: owner.email, phone: owner.phone || null, created_at: owner.created_at } : null,
      counts: {
        events: events.count || 0,
        inventory_items: inventory.count || 0,
        clients: clients.count || 0,
        members: (members.data || []).length,
        totalRevenue,
        salesCount: (sales.data || []).length,
      },
      members: membersList,
      recent_sales: sales.data || [],
    });
  } catch (err) {
    if (err instanceof AdminAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('Admin tenant detail error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await verifyPlatformAdmin();
    const { id } = await params;
    const body = await request.json();
    const serviceClient = await createServiceRoleClient();

    // Build update object — only allow specific fields
    const update: Record<string, any> = {};

    if (body.subscription_tier !== undefined) {
      const validTiers = ['starter', 'pro', 'business'];
      if (!validTiers.includes(body.subscription_tier)) {
        return NextResponse.json({ error: 'Invalid subscription tier' }, { status: 400 });
      }
      update.subscription_tier = body.subscription_tier;
    }

    if (body.is_suspended !== undefined) {
      update.is_suspended = Boolean(body.is_suspended);
      if (body.is_suspended) {
        update.suspended_at = new Date().toISOString();
        update.suspended_reason = body.suspended_reason || null;
      } else {
        update.suspended_at = null;
        update.suspended_reason = null;
      }
    }

    if (body.crm_enabled !== undefined) {
      update.crm_enabled = Boolean(body.crm_enabled);
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    update.updated_at = new Date().toISOString();

    const { data: tenant, error } = await serviceClient
      .from('tenants')
      .update(update)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating tenant:', error);
      return NextResponse.json({ error: 'Failed to update tenant' }, { status: 500 });
    }

    return NextResponse.json({ tenant });
  } catch (err) {
    if (err instanceof AdminAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('Admin tenant update error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}