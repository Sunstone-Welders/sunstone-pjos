// src/app/api/admin/notifications/[id]/route.ts
// GET: Single notification with full read stats
// PATCH: Update notification (draft/scheduled only)
// DELETE: Delete notification (draft/scheduled only)

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

    const { data: notification, error } = await serviceClient
      .from('platform_notifications')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !notification) {
      return NextResponse.json({ error: 'Notification not found' }, { status: 404 });
    }

    // Fetch read records with tenant info
    const { data: reads } = await serviceClient
      .from('platform_notification_reads')
      .select('tenant_id, user_id, read_at, cta_clicked_at')
      .eq('notification_id', id)
      .order('read_at', { ascending: false });

    // Get tenant names for the reads
    const tenantIds = [...new Set((reads || []).map(r => r.tenant_id))];
    let tenantNames: Record<string, string> = {};
    if (tenantIds.length > 0) {
      const { data: tenants } = await serviceClient
        .from('tenants')
        .select('id, name')
        .in('id', tenantIds);
      for (const t of tenants || []) {
        tenantNames[t.id] = t.name;
      }
    }

    const enrichedReads = (reads || []).map(r => ({
      ...r,
      tenant_name: tenantNames[r.tenant_id] || 'Unknown',
    }));

    return NextResponse.json({
      notification,
      reads: enrichedReads,
      read_count: enrichedReads.length,
      click_count: enrichedReads.filter(r => r.cta_clicked_at).length,
    });
  } catch (err) {
    if (err instanceof AdminAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('Admin notification detail error:', err);
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
    const serviceClient = await createServiceRoleClient();
    const body = await request.json();

    // Verify notification exists and is editable
    const { data: existing, error: fetchError } = await serviceClient
      .from('platform_notifications')
      .select('status')
      .eq('id', id)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json({ error: 'Notification not found' }, { status: 404 });
    }

    if (existing.status !== 'draft' && existing.status !== 'scheduled') {
      return NextResponse.json(
        { error: 'Can only edit draft or scheduled notifications' },
        { status: 400 }
      );
    }

    // Build update object
    const update: Record<string, any> = {};
    const allowedFields = [
      'type', 'title', 'body', 'image_url', 'cta_text', 'cta_link',
      'target_type', 'target_value', 'target_tenant_ids', 'status', 'scheduled_for',
    ];

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        update[field] = body[field];
      }
    }

    // Validate type if provided
    if (update.type) {
      const validTypes = ['announcement', 'product_launch', 'promotion', 'feature_update', 'tip_of_the_week'];
      if (!validTypes.includes(update.type)) {
        return NextResponse.json({ error: 'Invalid notification type' }, { status: 400 });
      }
    }

    // Validate target_type if provided
    if (update.target_type) {
      const validTargetTypes = ['all', 'tier', 'tag', 'specific'];
      if (!validTargetTypes.includes(update.target_type)) {
        return NextResponse.json({ error: 'Invalid target_type' }, { status: 400 });
      }
    }

    // Don't allow setting status to 'sent' via PATCH (use the /send endpoint)
    if (update.status === 'sent') {
      return NextResponse.json(
        { error: 'Use the /send endpoint to send notifications' },
        { status: 400 }
      );
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    const { data: notification, error } = await serviceClient
      .from('platform_notifications')
      .update(update)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating notification:', error);
      return NextResponse.json({ error: 'Failed to update notification' }, { status: 500 });
    }

    return NextResponse.json({ notification });
  } catch (err) {
    if (err instanceof AdminAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('Admin notification update error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await verifyPlatformAdmin();
    const { id } = await params;
    const serviceClient = await createServiceRoleClient();

    // Verify notification exists and is deletable
    const { data: existing, error: fetchError } = await serviceClient
      .from('platform_notifications')
      .select('status')
      .eq('id', id)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json({ error: 'Notification not found' }, { status: 404 });
    }

    if (existing.status !== 'draft' && existing.status !== 'scheduled') {
      return NextResponse.json(
        { error: 'Can only delete draft or scheduled notifications' },
        { status: 400 }
      );
    }

    const { error } = await serviceClient
      .from('platform_notifications')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting notification:', error);
      return NextResponse.json({ error: 'Failed to delete notification' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof AdminAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('Admin notification delete error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
