// ============================================================================
// Public Booking Page — /studio/[slug]/book/[type]
// ============================================================================
// Server component for generateMetadata(), renders BookingPage client.
// ============================================================================

import type { Metadata } from 'next';
import { createServiceRoleClient } from '@/lib/supabase/server';
import BookingPage from './BookingPage';

interface PageProps {
  params: Promise<{ slug: string; type: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug, type: bookingTypeId } = await params;
  const supabase = await createServiceRoleClient();

  const { data: tenant } = await supabase
    .from('tenants')
    .select('name, logo_url')
    .eq('slug', slug)
    .single();

  if (!tenant) return { title: 'Studio Not Found' };

  const { data: bookingType } = await supabase
    .from('booking_types')
    .select('name')
    .eq('id', bookingTypeId)
    .single();

  const serviceName = bookingType?.name || 'Appointment';

  return {
    title: `${serviceName} — Book with ${tenant.name}`,
    description: `Book a ${serviceName.toLowerCase()} appointment with ${tenant.name}`,
    openGraph: {
      title: `${serviceName} — ${tenant.name}`,
      description: `Book a ${serviceName.toLowerCase()} appointment with ${tenant.name}`,
      ...(tenant.logo_url ? { images: [{ url: tenant.logo_url }] } : {}),
    },
  };
}

export default async function BookTypePage({ params }: PageProps) {
  const { slug, type: bookingTypeId } = await params;
  return <BookingPage slug={slug} bookingTypeId={bookingTypeId} />;
}
