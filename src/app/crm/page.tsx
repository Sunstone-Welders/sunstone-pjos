import type { Metadata } from 'next'
import { createServerSupabase } from '@/lib/supabase/server'
import CRMPageClient from './crm-client'

export const metadata: Metadata = {
  title: 'CRM — Your AI-Powered Business Phone | Sunstone Studio',
  description: 'A dedicated phone number, automated marketing, and an AI assistant that texts your clients for you — all for $69/month. Replace $200-900/month in tools with one platform built for permanent jewelry artists.',
  openGraph: {
    title: 'CRM — Your AI-Powered Business Phone | Sunstone Studio',
    description: 'Sunny AI answers your client texts, sends aftercare, books appointments, and keeps your business top of mind — automatically.',
    url: 'https://sunstonepj.app/crm',
    siteName: 'Sunstone Studio',
    type: 'website',
  },
}

export default async function CRMPage() {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()

  let authState: 'anonymous' | 'trial' | 'has_base_no_crm' | 'has_crm' | 'expired_no_base' = 'anonymous'
  let trialEndDate: string | null = null

  if (user) {
    // Get tenant membership
    const { data: member } = await supabase
      .from('tenant_members')
      .select('tenant_id')
      .eq('user_id', user.id)
      .not('accepted_at', 'is', null)
      .limit(1)
      .single()

    if (member) {
      const { data: tenant } = await supabase
        .from('tenants')
        .select('trial_ends_at, subscription_status, stripe_subscription_id, crm_subscription_id, crm_enabled')
        .eq('id', member.tenant_id)
        .single()

      if (tenant) {
        const now = new Date()
        const trialEnd = tenant.trial_ends_at ? new Date(tenant.trial_ends_at) : null
        const inTrial = tenant.subscription_status === 'trialing' && trialEnd && trialEnd > now
        const hasBaseSub = tenant.subscription_status === 'active' || tenant.subscription_status === 'past_due'
        const hasCrm = !!tenant.crm_subscription_id || (tenant.crm_enabled && inTrial)

        if (hasCrm) {
          authState = 'has_crm'
        } else if (inTrial) {
          authState = 'trial'
          trialEndDate = tenant.trial_ends_at
        } else if (hasBaseSub) {
          authState = 'has_base_no_crm'
        } else {
          authState = 'expired_no_base'
        }
      }
    }
  }

  return <CRMPageClient authState={authState} trialEndDate={trialEndDate} />
}
