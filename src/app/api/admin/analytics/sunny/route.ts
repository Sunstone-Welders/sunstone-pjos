// Admin API — Sunny Conversation Intelligence
// Pulls analytics from usage_events (sunny_question_asked) since
// Sunny conversations are not persisted to a dedicated table.

import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { verifyPlatformAdmin, AdminAuthError } from '@/lib/admin/verify-platform-admin';

export async function GET() {
  try {
    await verifyPlatformAdmin();
  } catch (err) {
    if (err instanceof AdminAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: 'Auth error' }, { status: 500 });
  }

  const serviceClient = await createServiceRoleClient();
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // Total questions all time
  const { count: totalQuestions } = await serviceClient
    .from('usage_events')
    .select('*', { count: 'exact', head: true })
    .eq('event_type', 'sunny_question_asked');

  // Questions this week
  const { count: questionsThisWeek } = await serviceClient
    .from('usage_events')
    .select('*', { count: 'exact', head: true })
    .eq('event_type', 'sunny_question_asked')
    .gte('created_at', sevenDaysAgo);

  // Questions by day (last 30 days) — fetch raw then aggregate in JS
  const { data: dailyRaw } = await serviceClient
    .from('usage_events')
    .select('created_at')
    .eq('event_type', 'sunny_question_asked')
    .gte('created_at', thirtyDaysAgo)
    .order('created_at', { ascending: true });

  const dayCountMap: Record<string, number> = {};
  for (let i = 0; i < 30; i++) {
    const d = new Date(now.getTime() - (29 - i) * 24 * 60 * 60 * 1000);
    dayCountMap[d.toISOString().slice(0, 10)] = 0;
  }
  for (const row of dailyRaw || []) {
    const day = row.created_at.slice(0, 10);
    if (dayCountMap[day] !== undefined) dayCountMap[day]++;
  }
  const questionsByDay = Object.entries(dayCountMap).map(([date, count]) => ({ date, count }));

  // Top tenants by Sunny usage
  const { data: topTenantRaw } = await serviceClient
    .from('usage_events')
    .select('tenant_id')
    .eq('event_type', 'sunny_question_asked');

  const tenantCountMap: Record<string, number> = {};
  for (const row of topTenantRaw || []) {
    tenantCountMap[row.tenant_id] = (tenantCountMap[row.tenant_id] || 0) + 1;
  }
  const topTenantIds = Object.entries(tenantCountMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  // Fetch tenant names
  const tenantIds = topTenantIds.map(([id]) => id);
  const { data: tenantNames } = tenantIds.length > 0
    ? await serviceClient
        .from('tenants')
        .select('id, name')
        .in('id', tenantIds)
    : { data: [] };
  const nameMap: Record<string, string> = {};
  for (const t of tenantNames || []) nameMap[t.id] = t.name;

  const topTenants = topTenantIds.map(([id, count]) => ({
    tenant_id: id,
    tenant_name: nameMap[id] || 'Unknown',
    question_count: count,
  }));

  // Recent questions (last 20)
  const { data: recentRaw } = await serviceClient
    .from('usage_events')
    .select('tenant_id, metadata, created_at')
    .eq('event_type', 'sunny_question_asked')
    .order('created_at', { ascending: false })
    .limit(20);

  const recentTenantIds = [...new Set((recentRaw || []).map(r => r.tenant_id))];
  const { data: recentTenantNames } = recentTenantIds.length > 0
    ? await serviceClient
        .from('tenants')
        .select('id, name')
        .in('id', recentTenantIds)
    : { data: [] };
  const recentNameMap: Record<string, string> = {};
  for (const t of recentTenantNames || []) recentNameMap[t.id] = t.name;

  const recentQuestions = (recentRaw || []).map(r => ({
    question_preview: (r.metadata as any)?.question_preview || '(no preview)',
    tenant_name: recentNameMap[r.tenant_id] || 'Unknown',
    created_at: r.created_at,
  }));

  return NextResponse.json({
    total_questions: totalQuestions || 0,
    questions_this_week: questionsThisWeek || 0,
    questions_by_day: questionsByDay,
    top_tenants: topTenants,
    recent_questions: recentQuestions,
  });
}
