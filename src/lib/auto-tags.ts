import { createServiceRoleClient } from '@/lib/supabase/server';
import { queueWorkflow } from '@/lib/workflows';

interface AutoTagContext {
  type: 'sale' | 'waiver';
  eventId?: string;
  eventName?: string;
}

/**
 * Auto-tag a client based on sale/waiver context.
 * Runs server-side with service role (no RLS).
 */
export async function autoTagClient(
  tenantId: string,
  clientId: string,
  context: AutoTagContext
): Promise<void> {
  const supabase = await createServiceRoleClient();

  // Fetch or seed auto-tags for this tenant
  let { data: autoTags } = await supabase
    .from('client_tags')
    .select('id, name, auto_apply_rule')
    .eq('tenant_id', tenantId)
    .eq('auto_apply', true);

  if (!autoTags || autoTags.length === 0) {
    // Seed default auto-tags with luxury palette colors
    await supabase.from('client_tags').insert([
      { tenant_id: tenantId, name: 'New Client', color: '#6B7F99', auto_apply: true, auto_apply_rule: 'first_purchase' },
      { tenant_id: tenantId, name: 'Repeat Client', color: '#9C8B7A', auto_apply: true, auto_apply_rule: 'repeat_purchase' },
    ]);
    const { data: seeded } = await supabase
      .from('client_tags')
      .select('id, name, auto_apply_rule')
      .eq('tenant_id', tenantId)
      .eq('auto_apply', true);
    autoTags = seeded || [];
  }

  // Count client's completed sales
  const { count: salesCount } = await supabase
    .from('sales')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', clientId)
    .eq('status', 'completed');

  const totalSales = salesCount || 0;

  const tagsToApply: string[] = [];

  for (const tag of autoTags) {
    if (tag.auto_apply_rule === 'first_purchase' && totalSales <= 1) {
      tagsToApply.push(tag.id);
    }
    if (tag.auto_apply_rule === 'repeat_purchase' && totalSales >= 2) {
      tagsToApply.push(tag.id);
    }
  }

  // Event attendance tag (Copper color)
  if (context.eventName) {
    const tagName = context.eventName;
    let { data: eventTag } = await supabase
      .from('client_tags')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('name', tagName)
      .single();

    if (!eventTag) {
      const { data: created } = await supabase
        .from('client_tags')
        .insert({ tenant_id: tenantId, name: tagName, color: '#C07850', auto_apply: false })
        .select('id')
        .single();
      eventTag = created;
    }

    if (eventTag) tagsToApply.push(eventTag.id);
  }

  // Apply tags (skip if already assigned) + check for tag_added workflows
  const newlyAppliedTagIds: string[] = [];
  for (const tagId of tagsToApply) {
    const { data: existing } = await supabase
      .from('client_tag_assignments')
      .select('id')
      .eq('client_id', clientId)
      .eq('tag_id', tagId)
      .single();

    if (!existing) {
      await supabase.from('client_tag_assignments').insert({
        client_id: clientId,
        tag_id: tagId,
      });
      newlyAppliedTagIds.push(tagId);
    }
  }

  // Check for tag_added workflow triggers on newly applied tags
  if (newlyAppliedTagIds.length > 0) {
    try {
      // Get tag names for the newly applied tags
      const { data: tagRecords } = await supabase
        .from('client_tags')
        .select('id, name')
        .in('id', newlyAppliedTagIds);

      const tagNames = (tagRecords || []).map((t) => t.name);

      if (tagNames.length > 0) {
        // Find active workflows with tag_added trigger matching any of these tag names
        for (const tagName of tagNames) {
          const { data: tagWorkflows } = await supabase
            .from('workflow_templates')
            .select('id, trigger_type, trigger_tag')
            .eq('tenant_id', tenantId)
            .eq('trigger_type', 'tag_added')
            .eq('is_active', true)
            .eq('trigger_tag', tagName);

          for (const wf of tagWorkflows || []) {
            await queueWorkflow(tenantId, clientId, 'tag_added', wf.trigger_tag);
          }
        }
      }
    } catch {
      // Non-blocking — don't fail auto-tag if workflow check fails
    }
  }

  // If repeat client, remove "New Client" tag
  if (totalSales >= 2) {
    const newClientTag = autoTags.find((t) => t.auto_apply_rule === 'first_purchase');
    if (newClientTag) {
      await supabase
        .from('client_tag_assignments')
        .delete()
        .eq('client_id', clientId)
        .eq('tag_id', newClientTag.id);
    }
  }

  // Update last_visit_at for sale context
  if (context.type === 'sale') {
    await supabase
      .from('clients')
      .update({ last_visit_at: new Date().toISOString() })
      .eq('id', clientId);

    // Queue workflow follow-up messages
    try {
      // Determine trigger type
      const hasPrivatePartyTag = autoTags.some((t) => t.name === 'Private Party');
      const triggerType = context.eventName
        ? 'event_purchase'
        : hasPrivatePartyTag
          ? 'private_party_purchase'
          : 'event_purchase'; // default to event purchase
      await queueWorkflow(tenantId, clientId, triggerType);
    } catch (err) {
      console.error('[Workflow Queue] Failed to enqueue workflow:', err);
    }
  }
}
