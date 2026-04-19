// src/app/page.tsx
// Root route — shows landing page for visitors, redirects logged-in users

import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createServerSupabase, createServiceRoleClient } from '@/lib/supabase/server'
import LandingPageClient from './landing-client'

export const metadata: Metadata = {
  title: 'Sunstone Studio — The Operating System for Permanent Jewelry Artists',
  description: 'POS, inventory, AI mentor, CRM, digital waivers, reports — everything a permanent jewelry artist needs in one beautiful platform. Built by Sunstone Welders. Start your free 30-day trial.',
  keywords: [
    'permanent jewelry software',
    'permanent jewelry POS',
    'permanent jewelry business',
    'PJ business tools',
    'Sunstone Studio',
    'Sunstone Welders',
    'permanent jewelry inventory',
    'permanent jewelry CRM',
    'event POS',
    'jewelry business management',
    'Sunny AI mentor',
    'permanent jewelry starter kit',
  ],
  openGraph: {
    title: 'Sunstone Studio — Your Entire PJ Business. One Beautiful Platform.',
    description: 'POS, inventory, AI mentor, CRM, waivers, reports — built specifically for permanent jewelry artists by the pioneers of PJ.',
    url: 'https://sunstonepj.app',
    siteName: 'Sunstone Studio',
    type: 'website',
    images: [
      {
        url: '/landing/hero-dashboard.webp',
        width: 1200,
        height: 630,
        alt: 'Sunstone Studio dashboard showing AI-powered business insights',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Sunstone Studio — Your Entire PJ Business. One Beautiful Platform.',
    description: 'POS, inventory, AI mentor, CRM, waivers, reports — built for permanent jewelry artists.',
    images: ['/landing/hero-dashboard.webp'],
  },
  robots: { index: true, follow: true },
  alternates: { canonical: 'https://sunstonepj.app' },
}

export default async function LandingPage() {
  // Belt-and-suspenders: native shell should never see the landing page
  const cookieStore = await cookies()
  const isNative = cookieStore.get('sunstone_native')?.value === '1'

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

  return <LandingPageClient />
}
