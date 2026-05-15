// src/app/api/notifications/route.ts
// GET: Fetch sent notifications targeted to the current user's tenant

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: member } = await supabase
    .from('tenant_members')
    .select('tenant_id')
    .eq('user_id', user.id)
    .single();

  if (!member) return NextResponse.json({ error: 'No tenant' }, { status: 403 });

  // Fetch tenant details for tier-based targeting
  const { data: tenant } = await supabase
    .from('tenants')
    .select('id, subscription_tier')
    .eq('id', member.tenant_id)
    .single();

  if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 403 });

  // Fetch all sent notifications
  const { data: notifications, error } = await supabase
    .from('platform_notifications')
    .select('id, type, title, body, image_url, cta_text, cta_link, sent_at, target_type, target_value, target_tenant_ids')
    .eq('status', 'sent')
    .order('sent_at', { ascending: false })
    .limit(50);

  if (error) {
    console.error('Error fetching notifications:', error);
    return NextResponse.json({ error: 'Failed to fetch notifications' }, { status: 500 });
  }

  // Filter by targeting logic
  const targeted = (notifications || []).filter(n => {
    if (n.target_type === 'all') return true;
    if (n.target_type === 'tag') return true; // Tag system not built yet — treat as all
    if (n.target_type === 'tier') return n.target_value === tenant.subscription_tier;
    if (n.target_type === 'specific') {
      return n.target_tenant_ids && n.target_tenant_ids.includes(tenant.id);
    }
    return false;
  });

  // Fetch user's read records for these notifications
  const targetedIds = targeted.map(n => n.id);
  let readMap: Record<string, { read_at: string; cta_clicked_at: string | null }> = {};

  if (targetedIds.length > 0) {
    const { data: reads } = await supabase
      .from('platform_notification_reads')
      .select('notification_id, read_at, cta_clicked_at')
      .in('notification_id', targetedIds)
      .eq('user_id', user.id);

    for (const r of reads || []) {
      readMap[r.notification_id] = { read_at: r.read_at, cta_clicked_at: r.cta_clicked_at };
    }
  }

  // Build response — strip targeting fields
  const result = targeted.map(n => ({
    id: n.id,
    type: n.type,
    title: n.title,
    body: n.body,
    image_url: n.image_url,
    cta_text: n.cta_text,
    cta_link: n.cta_link,
    sent_at: n.sent_at,
    is_read: !!readMap[n.id],
    read_at: readMap[n.id]?.read_at || null,
  }));

  return NextResponse.json({ notifications: result });
}
