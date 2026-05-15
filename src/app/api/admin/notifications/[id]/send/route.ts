// src/app/api/admin/notifications/[id]/send/route.ts
// POST: Send a notification immediately (sets status to 'sent')

import { NextRequest, NextResponse } from 'next/server';
import { verifyPlatformAdmin, AdminAuthError } from '@/lib/admin/verify-platform-admin';
import { createServiceRoleClient } from '@/lib/supabase/server';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await verifyPlatformAdmin();
    const { id } = await params;
    const serviceClient = await createServiceRoleClient();

    // Verify notification exists and can be sent
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
        { error: 'Can only send draft or scheduled notifications' },
        { status: 400 }
      );
    }

    // Mark as sent
    const { data: notification, error } = await serviceClient
      .from('platform_notifications')
      .update({
        status: 'sent',
        sent_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error sending notification:', error);
      return NextResponse.json({ error: 'Failed to send notification' }, { status: 500 });
    }

    // NOTE: Push notification dispatch will be added in Phase 4.

    return NextResponse.json({ notification });
  } catch (err) {
    if (err instanceof AdminAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('Admin notification send error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
