// src/app/api/notifications/unread-count/route.ts
// GET: Return count of unread platform notifications for the current user

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ count: 0 });

  const { data: member } = await supabase
    .from('tenant_members')
    .select('tenant_id')
    .eq('user_id', user.id)
    .single();

  if (!member) return NextResponse.json({ count: 0 });

  // Fetch tenant tier for targeting
  const { data: tenant } = await supabase
    .from('tenants')
    .select('id, subscription_tier')
    .eq('id', member.tenant_id)
    .single();

  if (!tenant) return NextResponse.json({ count: 0 });

  // Fetch all sent notifications
  const { data: notifications } = await supabase
    .from('platform_notifications')
    .select('id, target_type, target_value, target_tenant_ids')
    .eq('status', 'sent');

  // Filter by targeting logic
  const targeted = (notifications || []).filter(n => {
    if (n.target_type === 'all') return true;
    if (n.target_type === 'tag') return true;
    if (n.target_type === 'tier') return n.target_value === tenant.subscription_tier;
    if (n.target_type === 'specific') {
      return n.target_tenant_ids && n.target_tenant_ids.includes(tenant.id);
    }
    return false;
  });

  if (targeted.length === 0) {
    return NextResponse.json({ count: 0 });
  }

  // Fetch user's read records
  const targetedIds = targeted.map(n => n.id);
  const { data: reads } = await supabase
    .from('platform_notification_reads')
    .select('notification_id')
    .in('notification_id', targetedIds)
    .eq('user_id', user.id);

  const readIds = new Set((reads || []).map(r => r.notification_id));
  const unreadCount = targeted.filter(n => !readIds.has(n.id)).length;

  return NextResponse.json({ count: unreadCount });
}
