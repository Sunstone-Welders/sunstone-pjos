// src/app/api/admin/notifications/route.ts
// GET: List all notifications with read/click stats
// POST: Create a new notification

import { NextRequest, NextResponse } from 'next/server';
import { verifyPlatformAdmin, AdminAuthError } from '@/lib/admin/verify-platform-admin';
import { createServiceRoleClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const admin = await verifyPlatformAdmin();
    const serviceClient = await createServiceRoleClient();

    const { searchParams } = new URL(request.url);
    const statusFilter = searchParams.get('status');

    // Fetch notifications
    let query = serviceClient
      .from('platform_notifications')
      .select('*');

    if (statusFilter) {
      query = query.eq('status', statusFilter);
    }

    const { data: notifications, error } = await query
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching notifications:', error);
      return NextResponse.json({ error: 'Failed to fetch notifications' }, { status: 500 });
    }

    // Fetch all read records for stats
    const notificationIds = (notifications || []).map(n => n.id);
    let readStats: Record<string, { read_count: number; click_count: number }> = {};

    if (notificationIds.length > 0) {
      const { data: reads } = await serviceClient
        .from('platform_notification_reads')
        .select('notification_id, tenant_id, cta_clicked_at')
        .in('notification_id', notificationIds);

      for (const r of reads || []) {
        if (!readStats[r.notification_id]) {
          readStats[r.notification_id] = { read_count: 0, click_count: 0 };
        }
        readStats[r.notification_id].read_count++;
        if (r.cta_clicked_at) {
          readStats[r.notification_id].click_count++;
        }
      }
    }

    // Get total tenant count for "all" targeting estimate
    const { count: totalTenants } = await serviceClient
      .from('tenants')
      .select('id', { count: 'exact', head: true });

    // Enrich notifications with stats
    const enriched = (notifications || []).map(n => {
      let total_targeted = 0;
      if (n.target_type === 'all' || n.target_type === 'tag') {
        total_targeted = totalTenants || 0;
      } else if (n.target_type === 'specific' && n.target_tenant_ids) {
        total_targeted = n.target_tenant_ids.length;
      }
      // For 'tier' targeting, we'd need to count — do it inline
      return {
        ...n,
        read_count: readStats[n.id]?.read_count || 0,
        click_count: readStats[n.id]?.click_count || 0,
        total_targeted,
      };
    });

    // For tier-targeted notifications, fetch actual counts
    const tierNotifications = enriched.filter(n => n.target_type === 'tier' && n.target_value);
    if (tierNotifications.length > 0) {
      const uniqueTiers = [...new Set(tierNotifications.map(n => n.target_value))];
      for (const tier of uniqueTiers) {
        const { count } = await serviceClient
          .from('tenants')
          .select('id', { count: 'exact', head: true })
          .eq('subscription_tier', tier!);
        for (const n of enriched) {
          if (n.target_type === 'tier' && n.target_value === tier) {
            n.total_targeted = count || 0;
          }
        }
      }
    }

    // Sort: draft/scheduled first (by created_at DESC), then sent (by sent_at DESC)
    enriched.sort((a, b) => {
      const aIsPending = a.status === 'draft' || a.status === 'scheduled';
      const bIsPending = b.status === 'draft' || b.status === 'scheduled';
      if (aIsPending && !bIsPending) return -1;
      if (!aIsPending && bIsPending) return 1;
      if (aIsPending && bIsPending) {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
      // Both sent/archived — sort by sent_at DESC
      const aSent = a.sent_at || a.created_at;
      const bSent = b.sent_at || b.created_at;
      return new Date(bSent).getTime() - new Date(aSent).getTime();
    });

    return NextResponse.json({ notifications: enriched });
  } catch (err) {
    if (err instanceof AdminAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('Admin notifications list error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const admin = await verifyPlatformAdmin();
    const serviceClient = await createServiceRoleClient();
    const body = await request.json();

    // Validate required fields
    if (!body.type || !body.title || !body.body) {
      return NextResponse.json(
        { error: 'type, title, and body are required' },
        { status: 400 }
      );
    }

    const validTypes = ['announcement', 'product_launch', 'promotion', 'feature_update', 'tip_of_the_week'];
    if (!validTypes.includes(body.type)) {
      return NextResponse.json({ error: 'Invalid notification type' }, { status: 400 });
    }

    const validTargetTypes = ['all', 'tier', 'tag', 'specific'];
    const targetType = body.target_type || 'all';
    if (!validTargetTypes.includes(targetType)) {
      return NextResponse.json({ error: 'Invalid target_type' }, { status: 400 });
    }

    const { data: notification, error } = await serviceClient
      .from('platform_notifications')
      .insert({
        created_by: admin.id,
        type: body.type,
        title: body.title,
        body: body.body,
        image_url: body.image_url || null,
        cta_text: body.cta_text || null,
        cta_link: body.cta_link || null,
        target_type: targetType,
        target_value: body.target_value || null,
        target_tenant_ids: body.target_tenant_ids || null,
        status: body.status === 'scheduled' ? 'scheduled' : 'draft',
        scheduled_for: body.scheduled_for || null,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating notification:', error);
      return NextResponse.json({ error: 'Failed to create notification' }, { status: 500 });
    }

    return NextResponse.json({ notification }, { status: 201 });
  } catch (err) {
    if (err instanceof AdminAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('Admin notification create error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
