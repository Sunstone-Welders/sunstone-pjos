// ============================================================================
// Manage Booking Page — /booking/manage/[token]
// ============================================================================
// Server component for generateMetadata(). Renders ManageBookingPage client.
// Accessed via the cancellation_token link in booking SMS.
// ============================================================================

import type { Metadata } from 'next';
import ManageBookingPage from './ManageBookingPage';

export const metadata: Metadata = {
  title: 'Manage Your Booking — Sunstone Studio',
  description: 'Cancel or reschedule your permanent jewelry appointment.',
};

interface PageProps {
  params: Promise<{ token: string }>;
}

export default async function ManageBookingRoute({ params }: PageProps) {
  const { token } = await params;
  return <ManageBookingPage token={token} />;
}
