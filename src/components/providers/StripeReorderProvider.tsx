// ============================================================================
// Stripe Reorder Provider — src/components/providers/StripeReorderProvider.tsx
// ============================================================================
// Wraps children in Stripe Elements for the supply reorder flow.
// Uses SUNSTONE's publishable key (no connected account).
// ============================================================================

'use client';

import { Elements } from '@stripe/react-stripe-js';
import { loadStripe, type Stripe } from '@stripe/stripe-js';
import { type ReactNode } from 'react';

let stripePromise: Promise<Stripe | null> | null = null;

function getStripe() {
  if (!stripePromise) {
    stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);
  }
  return stripePromise;
}

interface Props {
  clientSecret: string;
  children: ReactNode;
}

export default function StripeReorderProvider({ clientSecret, children }: Props) {
  return (
    <Elements
      stripe={getStripe()}
      options={{
        clientSecret,
        appearance: {
          theme: 'stripe',
          variables: {
            colorPrimary: '#7A234A',
            borderRadius: '12px',
            fontFamily: 'Inter, system-ui, sans-serif',
          },
        },
      }}
    >
      {children}
    </Elements>
  );
}
