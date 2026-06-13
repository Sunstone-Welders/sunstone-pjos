// src/app/page.tsx
// Root route — shows landing page for visitors, redirects logged-in users

import type { Metadata } from 'next'
import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { createServerSupabase, createServiceRoleClient } from '@/lib/supabase/server'
import { isNativeRequest } from '@/lib/native-server'
import LandingPageClient from './landing-client'

export const metadata: Metadata = {
  title: 'Permanent Jewelry Software & POS App | Sunstone Studio',
  description: 'Run your permanent jewelry business in one app — POS, chain inventory by the inch, events, waivers, clients, and AI support. Try Pro free for 30 days.',
  keywords: [
    'permanent jewelry software',
    'permanent jewelry POS',
    'permanent jewelry business',
    'permanent jewelry app',
    'PJ business tools',
    'Sunstone Studio',
    'Sunstone Permanent Jewelry',
    'permanent jewelry inventory',
    'permanent jewelry CRM',
    'event POS',
    'jewelry business management',
    'Sunny AI mentor',
    'permanent jewelry starter kit',
    'chain inventory by the inch',
    'permanent jewelry events',
    'digital waivers permanent jewelry',
  ],
  openGraph: {
    title: 'The All-in-One App to Grow Your Permanent Jewelry Business',
    description: 'POS, chain inventory by the inch, events, digital waivers, clients, and an AI mentor — built for permanent jewelry artists. Try Pro free for 30 days.',
    url: 'https://sunstonepj.app',
    siteName: 'Sunstone Studio',
    type: 'website',
    images: [
      {
        url: '/landing/hero-dashboard.webp',
        width: 1200,
        height: 630,
        alt: 'Sunstone Studio dashboard showing POS, inventory, and AI-powered business insights for permanent jewelry artists',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'The All-in-One App to Grow Your Permanent Jewelry Business',
    description: 'POS, chain inventory by the inch, events, digital waivers, clients, and an AI mentor — built for permanent jewelry artists. Try Pro free for 30 days.',
    images: ['/landing/hero-dashboard.webp'],
  },
  robots: { index: true, follow: true },
  alternates: { canonical: 'https://sunstonepj.app' },
}

export default async function LandingPage() {
  // Belt-and-suspenders: native shell should never see the landing page
  // UA check covers the very first request; cookie is a speedup fallback.
  const cookieStore = await cookies()
  const headerList = await headers()
  const isNative = isNativeRequest({
    userAgent: headerList.get('user-agent') || '',
    cookieValue: cookieStore.get('sunstone_native')?.value,
  })

  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()

  if (isNative) {
    redirect(user ? '/dashboard' : '/auth/login')
  }

  if (user) {
    // Preserve existing admin redirect behavior
    const serviceClient = await createServiceRoleClient()
    const { data: adminRecord } = await serviceClient
      .from('platform_admins')
      .select('user_id')
      .eq('user_id', user.id)
      .single()

    if (adminRecord) {
      redirect('/admin')
    }

    redirect('/dashboard')
  }

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'Sunstone Studio',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'iOS, Android, Web',
    url: 'https://sunstonepj.app',
    description:
      'All-in-one business app for permanent jewelry artists: POS, chain inventory by the inch, events, digital waivers, clients, reporting, and AI-powered support.',
    offers: {
      '@type': 'AggregateOffer',
      lowPrice: '99',
      highPrice: '279',
      priceCurrency: 'USD',
      offerCount: '3',
    },
    publisher: {
      '@type': 'Organization',
      name: 'Sunstone Permanent Jewelry',
      url: 'https://permanentjewelry.sunstonewelders.com',
    },
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <LandingPageClient />
    </>
  )
}
