import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

const DEFAULT_TEMPLATES = [
  // ── SMS Templates (10) ──────────────────────────────────────────────────
  {
    name: 'Welcome New Client',
    channel: 'sms',
    category: 'thank_you',
    is_default: true,
    body: 'Hi {{client_name}}, thank you for getting welded with {{business_name}}! We loved having you. Your permanent jewelry is designed to stay with you -- no clasps, no fuss. If you ever need anything, just text us back.',
  },
  {
    name: 'Aftercare',
    channel: 'sms',
    category: 'aftercare',
    is_default: true,
    body: 'Hi {{client_name}}, quick note from {{business_name}} about your new permanent jewelry:\n\n- Clean often with water, a gentle toothbrush, and dish soap. Pat dry.\n- Avoid harsh chemicals. Limit prolonged time in pools. Be mindful of lotions and perfumes.\n- Showering, exercising, and sleeping in it is totally fine.\n- If it ever breaks at the weld, we will repair it for free as long as you still have the chain.\n- To remove, just snip the jump ring with household scissors.\n\nQuestions? Just text us back.',
  },
  {
    name: 'Social Media Request',
    channel: 'sms',
    category: 'follow_up',
    is_default: true,
    body: 'Hi {{client_name}}, we hope you are loving your new piece from {{business_name}}! If you get a chance, we would love for you to share a photo and tag us on Instagram. It means the world to a small business like ours.',
  },
  {
    name: 'Review Request + Party Invite',
    channel: 'sms',
    category: 'follow_up',
    is_default: true,
    body: 'Hi {{client_name}}, it has been a week since your visit with {{business_name}} and we hope you are still loving your jewelry! If you have a sec, a quick review would mean so much to us. Also -- did you know we do private parties? Grab 5 friends and the host gets a free bracelet. Just reply if you are interested!',
  },
  {
    name: 'Miss You / Re-engagement',
    channel: 'sms',
    category: 'promotion',
    is_default: true,
    body: 'Hi {{client_name}}, it has been a while since your last visit with {{business_name}}! We have new chains in stock and would love to weld you again. Want to book a time?',
  },
  {
    name: 'Birthday',
    channel: 'sms',
    category: 'promotion',
    is_default: true,
    body: 'Happy birthday, {{client_name}}! We would love to celebrate with you -- come get a special birthday piece from {{business_name}}. Text us to set something up.',
  },
  {
    name: 'Private Party Invite',
    channel: 'sms',
    category: 'booking',
    is_default: true,
    body: 'Hi {{client_name}}, it was great meeting you! Did you know {{business_name}} does private permanent jewelry parties? It is a perfect girls night -- we bring everything to you. Interested? Just reply and we will get you set up.',
  },
  {
    name: 'Event Follow-Up',
    channel: 'sms',
    category: 'follow_up',
    is_default: true,
    body: 'Hi {{client_name}}, thanks for stopping by our booth! We loved welding you. If you have friends who are interested, we would love to connect. Feel free to share our info.',
  },
  {
    name: 'Referral Thank You',
    channel: 'sms',
    category: 'thank_you',
    is_default: true,
    body: 'Hi {{client_name}}, we heard you sent a friend our way -- thank you so much! Referrals mean the world to a small business like {{business_name}}. We appreciate you.',
  },
  {
    name: 'Event Announcement',
    channel: 'sms',
    category: 'promotion',
    is_default: true,
    body: 'Hi {{client_name}}, {{business_name}} will be at [Event Name] on [Date]! Come say hi and add to your collection. We will have new chains and styles. Hope to see you there!',
  },
  // ── Email Templates (3) ─────────────────────────────────────────────────
  {
    name: 'Welcome Email',
    channel: 'email',
    category: 'thank_you',
    is_default: true,
    subject: 'Welcome to {{business_name}}',
    body: 'Hi {{client_name}},\n\nThank you for choosing {{business_name}} for your permanent jewelry! We loved having you, and we hope you are enjoying your new piece.\n\nPermanent jewelry is designed to stay with you through everything -- showers, swimming, sleeping, all of it. No clasps to break, no pieces to lose.\n\nIf you ever have questions about your jewelry or want to add more pieces to your collection, just reply to this email or text us anytime.\n\nWelcome to the family.\n\n{{business_name}}',
  },
  {
    name: 'Aftercare Email',
    channel: 'email',
    category: 'aftercare',
    is_default: true,
    subject: 'Your Permanent Jewelry Care Guide',
    body: 'Hi {{client_name}},\n\nThank you for getting welded with {{business_name}}! Here is everything you need to know about caring for your new piece:\n\nClean often. Use water, a gentle toothbrush, and dish soap. Pat dry. Regular cleaning keeps your jewelry looking its best.\n\nAvoid harsh chemicals like bleach and acetone. Limit prolonged time in pools. Be mindful of lotions and perfumes near your jewelry.\n\nShowering, exercising, and sleeping in your permanent jewelry is perfectly fine. Live your life normally.\n\nSterling silver pieces may tarnish over time. A gentle clean will bring them right back to life.\n\nGold-filled and 14k pieces are very low-maintenance. Just wear them and enjoy.\n\nFree repairs for life. If your piece ever breaks at the weld, reach out to us and we will re-weld it free of charge as long as you still have the chain.\n\nTo remove your jewelry, simply snip the jump ring with household scissors or a nail cutter.\n\nThank you again for trusting us with your jewelry. We hope you love it.\n\n{{business_name}}',
  },
  {
    name: 'Private Party Email',
    channel: 'email',
    category: 'booking',
    is_default: true,
    subject: 'Host a Permanent Jewelry Party',
    body: 'Hi {{client_name}},\n\nIt was so great meeting you! I wanted to reach out because {{business_name}} offers private permanent jewelry parties -- and they are a blast.\n\nHere is how it works: you pick the place (your home, office, or wherever), invite your friends, and we bring everything to you. Everyone gets welded, and it makes for an unforgettable girls night, birthday, or celebration.\n\nInterested? Just reply and we will get the details sorted.\n\n{{business_name}}',
  },
];

export async function GET(request: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: member } = await supabase
    .from('tenant_members')
    .select('tenant_id')
    .eq('user_id', user.id)
    .limit(1)
    .single();
  if (!member) return NextResponse.json({ error: 'No tenant membership' }, { status: 403 });
  const tenantId = member.tenant_id;

  const channel = request.nextUrl.searchParams.get('channel');
  const category = request.nextUrl.searchParams.get('category');

  // Seed defaults if none exist
  const { data: existing } = await supabase
    .from('message_templates')
    .select('id')
    .eq('tenant_id', tenantId)
    .limit(1);

  if (!existing || existing.length === 0) {
    await supabase.from('message_templates').insert(
      DEFAULT_TEMPLATES.map((t) => ({ ...t, tenant_id: tenantId }))
    );
  }

  let query = supabase
    .from('message_templates')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('channel')
    .order('name');

  if (channel) query = query.eq('channel', channel);
  if (category) query = query.eq('category', category);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: member } = await supabase
    .from('tenant_members')
    .select('tenant_id')
    .eq('user_id', user.id)
    .limit(1)
    .single();
  if (!member) return NextResponse.json({ error: 'No tenant membership' }, { status: 403 });
  const tenantId = member.tenant_id;

  const body = await request.json();
  const { name, channel, subject, body: templateBody, category } = body;

  if (!name || !channel || !templateBody) {
    return NextResponse.json({ error: 'name, channel, and body are required' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('message_templates')
    .insert({
      tenant_id: tenantId,
      name: name.trim(),
      channel,
      subject: subject || null,
      body: templateBody,
      category: category || 'general',
      is_default: false,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
