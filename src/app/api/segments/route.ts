import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const tenantId = request.nextUrl.searchParams.get('tenantId');
  if (!tenantId) return NextResponse.json({ error: 'tenantId required' }, { status: 400 });

  const { data, error } = await supabase
    .from('client_segments')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('name');

  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { tenant_id, name, description, filter_criteria } = body;

  if (!tenant_id || !name) {
    return NextResponse.json({ error: 'tenant_id and name required' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('client_segments')
    .insert({
      tenant_id,
      name: name.trim(),
      description: description || null,
      filter_criteria: filter_criteria || {},
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
