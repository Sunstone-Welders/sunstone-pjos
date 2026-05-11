// ============================================================================
// Public Artist Profile — /studio/[slug]
// ============================================================================
// Server component for generateMetadata() SEO, renders ProfilePage client component.
// ============================================================================

import type { Metadata } from 'next';
import { createServiceRoleClient } from '@/lib/supabase/server';
import ProfilePage from './ProfilePage';

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const supabase = await createServiceRoleClient();
  const { data: tenant } = await supabase
    .from('tenants')
    .select('name, bio, city, state, logo_url, custom_domain, custom_domain_status')
    .eq('slug', slug)
    .single();

  if (!tenant) {
    return { title: 'Studio Not Found' };
  }

  const location = [tenant.city, tenant.state].filter(Boolean).join(', ');
  const description = tenant.bio || `${tenant.name}${location ? ` — ${location}` : ''} — Permanent Jewelry Artist`;

  // Use custom domain as canonical URL when active, otherwise default
  const canonicalUrl =
    tenant.custom_domain && tenant.custom_domain_status === 'active'
      ? `https://${tenant.custom_domain}`
      : `https://sunstonepj.app/studio/${slug}`;

  return {
    title: `${tenant.name} — Permanent Jewelry`,
    description,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title: tenant.name,
      description,
      url: canonicalUrl,
      ...(tenant.logo_url ? { images: [{ url: tenant.logo_url }] } : {}),
    },
  };
}

export default async function StudioPage({ params }: PageProps) {
  const { slug } = await params;
  return <ProfilePage slug={slug} />;
}
