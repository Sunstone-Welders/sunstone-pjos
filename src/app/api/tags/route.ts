import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { isInPalette, nearestPaletteColor } from '@/lib/tag-colors';

const DEFAULT_TAGS = [
  // Auto-applied tags (system handles automatically)
  { name: 'New Client', color: '#6B7F99', auto_apply: true, auto_apply_rule: 'first_purchase' },
  { name: 'Repeat Client', color: '#9C8B7A', auto_apply: true, auto_apply_rule: 'repeat_purchase' },
  // Manual tags (artist applies)
  { name: 'VIP', color: '#C9A96E', auto_apply: false, auto_apply_rule: null },
  { name: 'Girls Night', color: '#B76E79', auto_apply: false, auto_apply_rule: null },
  { name: 'Private Party', color: '#8B6E7F', auto_apply: false, auto_apply_rule: null },
  { name: 'Referral Source', color: '#7D8E6E', auto_apply: false, auto_apply_rule: null },
];

// Old tag names → new names (for existing tenants)
const RENAME_MAP: Record<string, { newName: string; color: string; auto_apply?: boolean; auto_apply_rule?: string }> = {
  'First Timer': { newName: 'New Client', color: '#6B7F99', auto_apply: true, auto_apply_rule: 'first_purchase' },
  'Repeat Customer': { newName: 'Repeat Client', color: '#9C8B7A', auto_apply: true, auto_apply_rule: 'repeat_purchase' },
  'Bridal Party': { newName: 'Girls Night', color: '#B76E79' },
};

// Tags to delete if they have 0 assignments
const DELETE_IF_UNUSED = ['Event Lead', 'Celebration'];

async function cleanupOldTags(supabase: any, tenantId: string) {
  // 1. Rename old tags
  for (const [oldName, update] of Object.entries(RENAME_MAP)) {
    const { data: oldTag } = await supabase
      .from('client_tags')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('name', oldName)
      .single();

    if (oldTag) {
      // Check if the new name already exists
      const { data: newTag } = await supabase
        .from('client_tags')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('name', update.newName)
        .single();

      if (newTag) {
        // New name already exists — just delete the old one (reassign any assignments first)
        await supabase
          .from('client_tag_assignments')
          .update({ tag_id: newTag.id })
          .eq('tag_id', oldTag.id);
        await supabase.from('client_tags').delete().eq('id', oldTag.id);
      } else {
        // Rename
        const updateFields: Record<string, any> = { name: update.newName, color: update.color };
        if (update.auto_apply !== undefined) updateFields.auto_apply = update.auto_apply;
        if (update.auto_apply_rule !== undefined) updateFields.auto_apply_rule = update.auto_apply_rule;
        await supabase.from('client_tags').update(updateFields).eq('id', oldTag.id);
      }
    }
  }

  // 2. Delete unused old tags
  for (const tagName of DELETE_IF_UNUSED) {
    const { data: tag } = await supabase
      .from('client_tags')
      .select('id, client_tag_assignments(count)')
      .eq('tenant_id', tenantId)
      .eq('name', tagName)
      .single();

    if (tag) {
      const count = tag.client_tag_assignments?.[0]?.count ?? 0;
      if (count === 0) {
        await supabase.from('client_tags').delete().eq('id', tag.id);
      }
    }
  }
}

export async function GET(request: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const tenantId = request.nextUrl.searchParams.get('tenantId');
  if (!tenantId) return NextResponse.json({ error: 'tenantId required' }, { status: 400 });

  // Check if tags exist; if not, seed defaults
  const { data: existing } = await supabase
    .from('client_tags')
    .select('id')
    .eq('tenant_id', tenantId)
    .limit(1);

  if (!existing || existing.length === 0) {
    await supabase.from('client_tags').insert(
      DEFAULT_TAGS.map((t) => ({
        tenant_id: tenantId,
        name: t.name,
        color: t.color,
        auto_apply: t.auto_apply,
        auto_apply_rule: t.auto_apply_rule,
      }))
    );
  } else {
    // Existing tenant — cleanup old tag names
    await cleanupOldTags(supabase, tenantId);
  }

  // Return tags with usage count
  const { data: tags, error } = await supabase
    .from('client_tags')
    .select('*, client_tag_assignments(count)')
    .eq('tenant_id', tenantId)
    .order('name');

  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 });

  // Migrate non-palette colors to nearest palette match (fire-and-forget)
  for (const tag of tags || []) {
    if (tag.color && !isInPalette(tag.color)) {
      const newColor = nearestPaletteColor(tag.color);
      supabase.from('client_tags').update({ color: newColor }).eq('id', tag.id).then(() => {});
      tag.color = newColor; // Return corrected color immediately
    }
  }

  const result = (tags || []).map((tag: any) => ({
    id: tag.id,
    tenant_id: tag.tenant_id,
    name: tag.name,
    color: tag.color,
    auto_apply: tag.auto_apply ?? false,
    auto_apply_rule: tag.auto_apply_rule ?? null,
    created_at: tag.created_at,
    usage_count: tag.client_tag_assignments?.[0]?.count ?? 0,
  }));

  return NextResponse.json(result);
}

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { tenant_id, name, color } = body;

  if (!tenant_id || !name) {
    return NextResponse.json({ error: 'tenant_id and name required' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('client_tags')
    .insert({
      tenant_id,
      name: name.trim(),
      color: color || '#7A8B8C',
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'A tag with that name already exists' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
  return NextResponse.json(data, { status: 201 });
}
