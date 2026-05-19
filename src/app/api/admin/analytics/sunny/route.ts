// Admin API — Sunny Conversation Intelligence
// Pulls analytics from sunny_messages and sunny_conversations tables.
// Falls back to usage_events for historical data from before conversation persistence.

import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { verifyPlatformAdmin, AdminAuthError } from '@/lib/admin/verify-platform-admin';

// Common English stop words to exclude from topic keyword extraction
const STOP_WORDS = new Set([
  'i', 'me', 'my', 'we', 'our', 'you', 'your', 'he', 'she', 'it', 'they', 'them',
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
  'by', 'is', 'am', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
  'do', 'does', 'did', 'will', 'would', 'could', 'should', 'can', 'may', 'might',
  'not', 'no', 'so', 'if', 'then', 'than', 'that', 'this', 'what', 'which', 'who',
  'how', 'when', 'where', 'why', 'all', 'each', 'every', 'any', 'some', 'just',
  'about', 'up', 'out', 'from', 'into', 'over', 'after', 'before', 'between',
  'through', 'during', 'here', 'there', 'also', 'very', 'much', 'more', 'most',
  'other', 'its', 'his', 'her', 'their', 'our', 'as', 'like', 'get', 'got',
  'know', 'think', 'want', 'need', 'use', 'make', 'go', 'see', 'look', 'take',
  'come', 'give', 'tell', 'say', 'said', 'one', 'two', 'new', 'old', 'first',
  'last', 'long', 'great', 'little', 'own', 'right', 'still', 'too', 'back',
  'only', 'way', 'well', 'even', 'now', 'thing', 'things', 'let', 'put', 'set',
  'try', 'ask', 'work', 'call', 'keep', 'help', 'show', 'turn', 'play', 'run',
  'move', 'live', 'believe', 'bring', 'happen', 'write', 'sit', 'stand', 'lose',
  'pay', 'meet', 'include', 'continue', 'learn', 'change', 'lead', 'understand',
  'dont', "don't", 'im', "i'm", 'ive', "i've", 'cant', "can't", 'doesnt', "doesn't",
  'thanks', 'thank', 'please', 'hi', 'hey', 'hello', 'okay', 'ok', 'yeah', 'yes',
]);

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

  // Run queries in parallel for performance
  const [
    totalQuestionsRes,
    questionsThisWeekRes,
    dailyRawRes,
    topTenantRawRes,
    recentQuestionsRes,
    feedbackRes,
    conversationStatsRes,
    topicKeywordsRes,
  ] = await Promise.all([
    // Total questions all time (user messages only)
    serviceClient
      .from('sunny_messages')
      .select('*', { count: 'exact', head: true })
      .eq('role', 'user'),

    // Questions this week
    serviceClient
      .from('sunny_messages')
      .select('*', { count: 'exact', head: true })
      .eq('role', 'user')
      .gte('created_at', sevenDaysAgo),

    // Questions by day (last 30 days)
    serviceClient
      .from('sunny_messages')
      .select('created_at')
      .eq('role', 'user')
      .gte('created_at', thirtyDaysAgo)
      .order('created_at', { ascending: true }),

    // Top tenants by message count
    serviceClient
      .from('sunny_messages')
      .select('tenant_id')
      .eq('role', 'user'),

    // Recent questions (last 20 user messages)
    serviceClient
      .from('sunny_messages')
      .select('tenant_id, content, created_at')
      .eq('role', 'user')
      .order('created_at', { ascending: false })
      .limit(20),

    // Feedback stats
    serviceClient
      .from('sunny_messages')
      .select('feedback')
      .not('feedback', 'is', null),

    // Conversation stats
    serviceClient
      .from('sunny_conversations')
      .select('message_count'),

    // Topic keyword extraction — last 200 user messages
    serviceClient
      .from('sunny_messages')
      .select('content')
      .eq('role', 'user')
      .order('created_at', { ascending: false })
      .limit(200),
  ]);

  // Questions by day aggregation
  const dayCountMap: Record<string, number> = {};
  for (let i = 0; i < 30; i++) {
    const d = new Date(now.getTime() - (29 - i) * 24 * 60 * 60 * 1000);
    dayCountMap[d.toISOString().slice(0, 10)] = 0;
  }
  for (const row of dailyRawRes.data || []) {
    const day = row.created_at.slice(0, 10);
    if (dayCountMap[day] !== undefined) dayCountMap[day]++;
  }
  const questionsByDay = Object.entries(dayCountMap).map(([date, count]) => ({ date, count }));

  // Top tenants aggregation
  const tenantCountMap: Record<string, number> = {};
  for (const row of topTenantRawRes.data || []) {
    tenantCountMap[row.tenant_id] = (tenantCountMap[row.tenant_id] || 0) + 1;
  }
  const topTenantIds = Object.entries(tenantCountMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  // Fetch tenant names for top + recent
  const allTenantIds = [
    ...new Set([
      ...topTenantIds.map(([id]) => id),
      ...(recentQuestionsRes.data || []).map((r: any) => r.tenant_id),
    ]),
  ];
  const { data: tenantNames } = allTenantIds.length > 0
    ? await serviceClient.from('tenants').select('id, name').in('id', allTenantIds)
    : { data: [] };
  const nameMap: Record<string, string> = {};
  for (const t of tenantNames || []) nameMap[t.id] = t.name;

  const topTenants = topTenantIds.map(([id, count]) => ({
    tenant_id: id,
    tenant_name: nameMap[id] || 'Unknown',
    question_count: count,
  }));

  // Recent questions
  const recentQuestions = (recentQuestionsRes.data || []).map((r: any) => ({
    question_preview: r.content?.slice(0, 100) || '(no preview)',
    tenant_name: nameMap[r.tenant_id] || 'Unknown',
    created_at: r.created_at,
  }));

  // Feedback stats
  let thumbsUp = 0;
  let thumbsDown = 0;
  for (const row of feedbackRes.data || []) {
    if (row.feedback === 'thumbs_up') thumbsUp++;
    if (row.feedback === 'thumbs_down') thumbsDown++;
  }

  // Average messages per conversation
  const convData = conversationStatsRes.data || [];
  const avgMessagesPerConversation = convData.length > 0
    ? Math.round((convData.reduce((sum: number, c: any) => sum + (c.message_count || 0), 0) / convData.length) * 10) / 10
    : 0;

  // Topic keywords — simple word frequency from last 200 user messages
  const wordFreq: Record<string, number> = {};
  for (const row of topicKeywordsRes.data || []) {
    const words = (row.content || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s'-]/g, '')
      .split(/\s+/)
      .filter((w: string) => w.length > 2 && !STOP_WORDS.has(w));
    for (const word of words) {
      wordFreq[word] = (wordFreq[word] || 0) + 1;
    }
  }
  const topicKeywords = Object.entries(wordFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([word, count]) => ({ word, count }));

  return NextResponse.json({
    total_questions: totalQuestionsRes.count || 0,
    questions_this_week: questionsThisWeekRes.count || 0,
    questions_by_day: questionsByDay,
    top_tenants: topTenants,
    recent_questions: recentQuestions,
    feedback_stats: { thumbs_up: thumbsUp, thumbs_down: thumbsDown },
    avg_messages_per_conversation: avgMessagesPerConversation,
    total_conversations: convData.length,
    topic_keywords: topicKeywords,
  });
}
