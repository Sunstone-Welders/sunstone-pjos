// ============================================================================
// Public Booking List — /studio/[slug]/book
// ============================================================================
// Server component for generateMetadata() SEO, renders BookingListPage client.
// ============================================================================

import type { Metadata } from 'next';
import { createServiceRoleClient } from '@/lib/supabase/server';
import BookingListPage from './BookingListPage';

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const supabase = await createServiceRoleClient();
  const { data: tenant } = await supabase
    .from('tenants')
    .select('name, bio, logo_url')
    .eq('slug', slug)
    .single();

  if (!tenant) {
    return { title: 'Studio Not Found' };
  }

  return {
    title: `Book with ${tenant.name} — Permanent Jewelry`,
    description: tenant.bio || `Book a permanent jewelry appointment with ${tenant.name}`,
    openGraph: {
      title: `Book with ${tenant.name}`,
      description: tenant.bio || `Book a permanent jewelry appointment with ${tenant.name}`,
      ...(tenant.logo_url ? { images: [{ url: tenant.logo_url }] } : {}),
    },
  };
}

export default async function BookPage({ params }: PageProps) {
  const { slug } = await params;
  return <BookingListPage slug={slug} />;
}
