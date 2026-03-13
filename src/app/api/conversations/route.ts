// ============================================================================
// Conversations List — GET /api/conversations
// ============================================================================
// Returns distinct client conversations + phone-only conversations
// with latest message and unread count.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

function formatPhoneDisplay(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  const last10 = digits.slice(-10);
  if (last10.length === 10) {
    return `(${last10.slice(0, 3)}) ${last10.slice(3, 6)}-${last10.slice(6)}`;
  }
  return phone;
}

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
  const tenantId = member.tenant_id;

  // 1. Client-linked conversations
  const { data: clients } = await supabase
    .from('clients')
    .select('id, first_name, last_name, phone, unread_messages, last_message_at')
    .eq('tenant_id', tenantId)
    .not('last_message_at', 'is', null)
    .order('last_message_at', { ascending: false });

  const clientConversations = await Promise.all(
    (clients || []).map(async (client) => {
      const { data: lastMsg } = await supabase
        .from('conversations')
        .select('body, direction, created_at')
        .eq('tenant_id', tenantId)
        .eq('client_id', client.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      return {
        client_id: client.id,
        client_name: [client.first_name, client.last_name].filter(Boolean).join(' ') || 'Unknown',
        client_phone: client.phone,
        last_message: lastMsg?.body || '',
        last_direction: lastMsg?.direction || 'outbound',
        last_message_at: client.last_message_at,
        unread_count: client.unread_messages || 0,
      };
    })
  );

  // 2. Phone-only conversations (client_id IS NULL)
  // Get distinct phone numbers with null client_id
  const { data: phoneOnlyMsgs } = await supabase
    .from('conversations')
    .select('phone_number, body, direction, created_at, read')
    .eq('tenant_id', tenantId)
    .is('client_id', null)
    .order('created_at', { ascending: false });

  // Group by phone number
  const phoneMap = new Map<string, {
    phone: string;
    lastBody: string;
    lastDirection: string;
    lastAt: string;
    unread: number;
  }>();

  for (const msg of phoneOnlyMsgs || []) {
    if (!msg.phone_number) continue;
    if (!phoneMap.has(msg.phone_number)) {
      phoneMap.set(msg.phone_number, {
        phone: msg.phone_number,
        lastBody: msg.body,
        lastDirection: msg.direction,
        lastAt: msg.created_at,
        unread: 0,
      });
    }
    const entry = phoneMap.get(msg.phone_number)!;
    if (msg.direction === 'inbound' && !msg.read) {
      entry.unread++;
    }
  }

  // Filter out phone-only entries whose digits match a known client
  // (handles transition period where old orphaned threads still exist)
  const clientPhoneDigits = new Set(
    (clients || [])
      .filter(c => c.phone)
      .map(c => c.phone!.replace(/\D/g, '').slice(-10))
  );

  const phoneConversations = Array.from(phoneMap.values())
    .filter((entry) => {
      const digits = entry.phone.replace(/\D/g, '').slice(-10);
      return !clientPhoneDigits.has(digits);
    })
    .map((entry) => ({
      client_id: null,
      client_name: formatPhoneDisplay(entry.phone),
      client_phone: entry.phone,
      last_message: entry.lastBody,
      last_direction: entry.lastDirection,
      last_message_at: entry.lastAt,
      unread_count: entry.unread,
    }));

  // 3. Merge and sort
  const conversations = [...clientConversations, ...phoneConversations];
  conversations.sort((a, b) => {
    if (a.unread_count > 0 && b.unread_count === 0) return -1;
    if (a.unread_count === 0 && b.unread_count > 0) return 1;
    return new Date(b.last_message_at || 0).getTime() - new Date(a.last_message_at || 0).getTime();
  });

  return NextResponse.json({ conversations });
}
