// src/app/api/notifications/[id]/read/route.ts
// POST: Mark a notification as read (idempotent)

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  const { data: member } = await supabase
    .from('tenant_members')
    .select('tenant_id')
    .eq('user_id', user.id)
    .single();

  if (!member) return NextResponse.json({ error: 'No tenant' }, { status: 403 });

  // Upsert — idempotent via ON CONFLICT
  const { error } = await supabase
    .from('platform_notification_reads')
    .upsert(
      {
        notification_id: id,
        tenant_id: member.tenant_id,
        user_id: user.id,
        read_at: new Date().toISOString(),
      },
      { onConflict: 'notification_id,user_id', ignoreDuplicates: true }
    );

  if (error) {
    console.error('Error marking notification as read:', error);
    return NextResponse.json({ error: 'Failed to mark as read' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
