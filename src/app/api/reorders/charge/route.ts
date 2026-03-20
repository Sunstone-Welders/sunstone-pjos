// ============================================================================
// Reorder Charge — src/app/api/reorders/charge/route.ts
// ============================================================================
// POST: Charge a saved card via SF/Authorize.net on an existing reorder.
// The SF Opportunity must already exist (created by /api/salesforce/create-reorder).
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase, createServiceRoleClient } from '@/lib/supabase/server';
import { sfChargeSavedCard } from '@/lib/salesforce';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { data: member } = await supabase
      .from('tenant_members')
      .select('tenant_id')
      .eq('user_id', user.id)
      .limit(1)
      .single();

    if (!member) {
      return NextResponse.json({ error: 'No tenant membership' }, { status: 403 });
    }

    const body = await request.json();
    const { reorderHistoryId, cardId, amount } = body;

    if (!reorderHistoryId || !cardId || !amount) {
      return NextResponse.json({ error: 'Missing reorderHistoryId, cardId, or amount' }, { status: 400 });
    }

    const serviceClient = await createServiceRoleClient();

    // Load the reorder record
    const { data: reorder } = await serviceClient
      .from('reorder_history')
      .select('sf_opportunity_id, status')
      .eq('id', reorderHistoryId)
      .eq('tenant_id', member.tenant_id)
      .single();

    if (!reorder) {
      return NextResponse.json({ error: 'Reorder not found' }, { status: 404 });
    }

    if (!reorder.sf_opportunity_id) {
      return NextResponse.json({ error: 'No Salesforce Opportunity exists for this order. Create the SF order first.' }, { status: 400 });
    }

    // Get sf_account_id from tenant
    const { data: tenant } = await serviceClient
      .from('tenants')
      .select('sf_account_id')
      .eq('id', member.tenant_id)
      .single();

    const sfAccountId = tenant?.sf_account_id;
    if (!sfAccountId) {
      return NextResponse.json({ error: 'No Salesforce account linked' }, { status: 400 });
    }

    // Charge via SF/Authorize.net
    const chargeResult = await sfChargeSavedCard(
      reorder.sf_opportunity_id,
      amount,
      cardId,
      sfAccountId
    );

    if (chargeResult.success === false || chargeResult.error) {
      return NextResponse.json({
        success: false,
        error: chargeResult.error || chargeResult.message || 'Payment charge failed',
      }, { status: 400 });
    }

    // Update reorder status to paid
    await serviceClient
      .from('reorder_history')
      .update({
        status: 'confirmed',
        stripe_payment_intent_id: chargeResult.transactionId || chargeResult.paymentReference || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', reorderHistoryId);

    return NextResponse.json({
      success: true,
      transactionId: chargeResult.transactionId || null,
    });
  } catch (err: any) {
    console.error('[Reorder Charge] Error:', err);
    return NextResponse.json({
      success: false,
      error: err.message || 'Payment processing failed',
    }, { status: 500 });
  }
}
