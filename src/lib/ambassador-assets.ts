// ============================================================================
// Ambassador Marketing Assets — src/lib/ambassador-assets.ts
// ============================================================================
// Generates personalized, copy-to-clipboard marketing content for ambassadors.
// All text is personalized with the ambassador's referral link.
// ============================================================================

export interface MarketingAsset {
  id: string;
  title: string;
  items: { label: string; text: string }[];
}

export function getMarketingAssets(referralLink: string): MarketingAsset[] {
  return [
    {
      id: 'captions',
      title: 'Social Media Captions',
      items: [
        {
          label: 'Instagram / Facebook',
          text: `Running a PJ business means juggling inventory, clients, events, and finances — all at once. I use Sunstone Studio to keep everything in one place. If you're looking for a platform built specifically for permanent jewelry artists, check it out: ${referralLink}`,
        },
        {
          label: 'Story / Casual',
          text: `If you're a PJ artist and you're still tracking inventory in spreadsheets... there's a better way. Sunstone Studio handles everything from POS to client management to AI business coaching. Try it free: ${referralLink}`,
        },
        {
          label: 'Educational / Value',
          text: `One thing that changed my PJ business: having a real system. Sunstone Studio is built by Sunstone — the people who make our welders — so it actually understands how we work. Free 30-day trial if you want to check it out: ${referralLink}`,
        },
      ],
    },
    {
      id: 'explainer',
      title: 'Quick Explainer',
      items: [
        {
          label: 'What is Sunstone Studio? (for DMs & messages)',
          text: `Sunstone Studio is an all-in-one business platform built specifically for permanent jewelry artists. It includes:\n\n• Point of sale with inventory tracking\n• Client CRM with two-way texting\n• Digital waivers and queue management\n• AI business coach (Sunny) trained on PJ industry knowledge\n• One-touch chain reordering from Sunstone\n• Event planning and financial reporting\n\nIt's made by Sunstone Permanent Jewelry — the same company that makes our welders. Try it free for 30 days: ${referralLink}`,
        },
      ],
    },
    {
      id: 'calculator',
      title: 'Your Earnings Potential',
      items: [
        {
          label: 'Commission Calculator',
          text: `Your Ambassador Earnings Potential:\n\n• Refer 3 artists on Starter ($99/mo) → $59.40/mo for 8 months = $475\n• Refer 3 artists on Pro ($169/mo) → $101.40/mo for 8 months = $811\n• Refer 5 artists on Pro ($169/mo) → $169/mo for 8 months = $1,352\n• Refer 10 artists mixed plans → $300-500/mo passive income`,
        },
      ],
    },
  ];
}
