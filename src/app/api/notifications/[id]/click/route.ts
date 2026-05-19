// src/app/api/notifications/[id]/click/route.ts
// POST: Track CTA click on a notification

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

  const now = new Date().toISOString();

  // Upsert — creates read record if none exists, or updates cta_clicked_at
  const { error } = await supabase
    .from('platform_notification_reads')
    .upsert(
      {
        notification_id: id,
        tenant_id: member.tenant_id,
        user_id: user.id,
        read_at: now,
        cta_clicked_at: now,
      },
      { onConflict: 'notification_id,user_id' }
    );

  if (error) {
    console.error('Error tracking CTA click:', error);
    return NextResponse.json({ error: 'Failed to track click' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
