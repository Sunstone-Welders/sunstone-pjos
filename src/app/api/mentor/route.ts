// src/app/api/mentor/route.ts
// POST endpoint for Sunny mentor chat with agentic tool execution

// Vercel function timeout — agentic loop needs up to 15 iterations for bulk operations
export const maxDuration = 120;
// ============================================================================
// V4: Tenant data enrichment + anti-hallucination hardening
// - Queries actual inventory items (chain names, quantities, prices)
// - Includes upcoming events, recent client count
// - Active queue status if an event is running
// - Stronger "don't guess" and "don't hallucinate" rules
// - Stricter question discipline (answer and stop)
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase, createServiceRoleClient } from '@/lib/supabase/server';
import { getSubscriptionTier, getSunnyQuestionLimit } from '@/lib/subscription';
import { getCachedCatalog, formatCatalogForPrompt } from '@/lib/shopify';
import { checkRateLimit } from '@/lib/rate-limit';
import {
  EQUIPMENT_KNOWLEDGE,
  WELDING_TECHNIQUE_KNOWLEDGE,
  TROUBLESHOOTING_KNOWLEDGE,
  PRODUCTS_KNOWLEDGE,
  BUSINESS_STRATEGY_KNOWLEDGE,
  CLIENT_EXPERIENCE_KNOWLEDGE,
  MARKETING_KNOWLEDGE,
  PJ_UNIVERSITY_AND_SUNNY_ROLE,
  PJOS_PLATFORM_GUIDE,
} from '@/lib/mentor-knowledge';
import { runAgenticLoop, buildAgenticSSEStream } from '@/lib/agentic-loop';
import { logAnthropicCost } from '@/lib/cost-tracker';
import { SUNNY_TOOL_DEFINITIONS, executeSunnyTool, getSunnyToolStatusLabel } from '@/lib/sunny-tools';

// ============================================================================
// Subsection registry — ~43 small chunks with keyword maps
// ============================================================================

interface Subsection {
  id: string;
  label: string;
  data: any;
  keywords: string[];
  priority?: number;
}

const SUBSECTIONS: Subsection[] = [
  // ── EQUIPMENT ──
  {
    id: 'eq-welders',
    label: 'Welders (Zapp, Zapp Plus 2, mPulse)',
    data: EQUIPMENT_KNOWLEDGE.welders,
    keywords: ['welder', 'zapp', 'mpulse', 'orion', 'pulse', 'trufire', 'tru fire', 'touchscreen', 'knob'],
  },
  {
    id: 'eq-kits',
    label: 'Starter Kits (Momentum, Dream, Legacy)',
    data: EQUIPMENT_KNOWLEDGE.starterKits,
    keywords: ['kit', 'momentum', 'dream', 'legacy', 'starter', 'came with', 'included', 'package', 'purchase', 'buy', 'bought'],
    priority: 1,
  },
  {
    id: 'eq-argon',
    label: 'Argon Setup',
    data: EQUIPMENT_KNOWLEDGE.argon,
    keywords: ['argon', 'gas', 'tank', 'regulator', 'flow', 'lpm', 'psi', 'compressed', 'hose', 'coupler', 'mini'],
  },
  {
    id: 'eq-electrode',
    label: 'Electrode Maintenance',
    data: EQUIPMENT_KNOWLEDGE.electrode,
    keywords: ['electrode', 'tungsten', 'sharpen', 'sharpening', 'pilot', 'protrusion', 'maintenance'],
  },
  {
    id: 'eq-settings',
    label: 'Weld Settings Chart (Joules by gauge/metal/welder)',
    data: EQUIPMENT_KNOWLEDGE.weldSettings,
    keywords: ['setting', 'joule', 'power', 'gauge', '20g', '22g', '24g', '26g', 'what setting', 'how many joule'],
    priority: 2,
  },
  {
    id: 'eq-optics',
    label: 'Optics / Magnification',
    data: EQUIPMENT_KNOWLEDGE.optics,
    keywords: ['optic', 'scope', 'adl', 'magnif', 'lens', 'camera', 'digital'],
  },
  {
    id: 'eq-rental',
    label: 'Sunstone OnDemand Rental Program',
    data: EQUIPMENT_KNOWLEDGE.rentalProgram,
    keywords: ['rent', 'rental', 'ondemand', 'on demand', 'try', 'borrow'],
  },

  // ── WELDING TECHNIQUE ──
  {
    id: 'wt-fundamentals',
    label: 'Fundamental Welding Process',
    data: WELDING_TECHNIQUE_KNOWLEDGE.fundamentalProcess,
    keywords: ['how to weld', 'welding process', 'basic', 'beginner', 'first weld', 'learn', 'start welding', 'touch and release'],
  },
  {
    id: 'wt-jumpring',
    label: 'Jump Ring Handling',
    data: WELDING_TECHNIQUE_KNOWLEDGE.jumpRingHandling,
    keywords: ['jump ring', 'jumpring', 'close', 'gap', 'overlap', 'pinch', 'opening', 'flush'],
  },
  {
    id: 'wt-grounding',
    label: 'Grounding Best Practices',
    data: WELDING_TECHNIQUE_KNOWLEDGE.grounding,
    keywords: ['ground', 'grounding', 'clip', 'clamp', 'connection', 'directly on'],
  },
  {
    id: 'wt-angle',
    label: 'Weld Angle',
    data: WELDING_TECHNIQUE_KNOWLEDGE.weldAngle,
    keywords: ['angle', '90', 'degree', 'perpendicular', 'position'],
  },
  {
    id: 'wt-multiple',
    label: 'Multiple Welds Technique',
    data: WELDING_TECHNIQUE_KNOWLEDGE.multipleWelds,
    keywords: ['multiple weld', 'pulse', 'several', 'repeat', 'thick', 'heavy gauge'],
  },
  {
    id: 'wt-mistakes',
    label: 'Common Weld Triggering Mistakes',
    data: WELDING_TECHNIQUE_KNOWLEDGE.weldTriggeringMistakes,
    keywords: ['mistake', 'wrong', 'trigger', 'misfire', 'beginner error'],
  },
  {
    id: 'wt-metals',
    label: 'Metal-Specific Welding Notes',
    data: WELDING_TECHNIQUE_KNOWLEDGE.metalWeldingNotes,
    keywords: ['gold fill weld', 'silver weld', 'stainless weld', 'solid gold weld', 'metal specific', 'discolor'],
  },
  {
    id: 'wt-pieces',
    label: 'Piece-Specific Technique Notes',
    data: WELDING_TECHNIQUE_KNOWLEDGE.pieceSpecificNotes,
    keywords: ['bracelet technique', 'anklet technique', 'necklace technique', 'ring technique', 'achilles', 'longer piece'],
  },

  // ── TROUBLESHOOTING ──
  {
    id: 'ts-top',
    label: 'Top Troubleshooting Issues',
    data: TROUBLESHOOTING_KNOWLEDGE.topIssues,
    keywords: ['problem', 'issue', 'troubleshoot', 'not working', 'help', 'break', 'broke', 'abort', 'won\'t', 'doesn\'t'],
    priority: 1,
  },
  {
    id: 'ts-electrode',
    label: 'Electrode Troubleshooting',
    data: TROUBLESHOOTING_KNOWLEDGE.electrode,
    keywords: ['electrode problem', 'stuck', 'welding to', 'ball', 'mushroom'],
  },
  {
    id: 'ts-power',
    label: 'Power Setting Troubleshooting',
    data: TROUBLESHOOTING_KNOWLEDGE.powerSettings,
    keywords: ['too low', 'too high', 'burn', 'dark spot', 'not hold', 'weak weld', 'power setting'],
  },
  {
    id: 'ts-ground',
    label: 'Grounding Issues',
    data: TROUBLESHOOTING_KNOWLEDGE.grounding,
    keywords: ['grounding issue', 'inconsistent', 'links fusing', 'chain fuse'],
  },
  {
    id: 'ts-escalation',
    label: 'Escalation to Sunstone Support',
    data: TROUBLESHOOTING_KNOWLEDGE.escalation,
    keywords: ['support', 'phone', 'contact', 'escalate', 'malfunction', 'return', 'refund'],
  },

  // ── PRODUCTS ──
  {
    id: 'pr-metals',
    label: 'Metal Types (gold, silver, stainless)',
    data: PRODUCTS_KNOWLEDGE.metalTypes,
    keywords: ['metal', 'gold', 'silver', 'sterling', 'stainless', 'steel', 'filled', '14k', 'karat', 'rose', 'white', 'hypoallergenic', 'tarnish'],
  },
  {
    id: 'pr-pieces',
    label: 'Piece Types (bracelet, anklet, necklace, ring)',
    data: PRODUCTS_KNOWLEDGE.pieceTypes,
    keywords: ['bracelet', 'anklet', 'necklace', 'ring', 'size', 'inch', 'default', 'how long', 'measure'],
  },
  {
    id: 'pr-connectors',
    label: 'Connectors vs. Charms',
    data: PRODUCTS_KNOWLEDGE.connectorsVsCharms,
    keywords: ['connector', 'charm', 'birthstone', 'initial', 'dangle', 'inline', 'bs connector'],
  },
  {
    id: 'pr-chainselect',
    label: 'Chain Selection Guidance',
    data: PRODUCTS_KNOWLEDGE.chainGuidance,
    keywords: ['chain select', 'which chain', 'recommend', 'popular', 'best seller', 'display', 'variety'],
  },
  {
    id: 'pr-jumpring-inv',
    label: 'Jump Ring Inventory',
    data: PRODUCTS_KNOWLEDGE.sunstoneJumpRingInventory,
    keywords: ['jump ring size', 'jump ring inventory', '3mm', '4mm', 'gauge jump'],
  },
  {
    id: 'pr-inventory',
    label: 'Inventory Planning',
    data: PRODUCTS_KNOWLEDGE.inventoryPlanning,
    keywords: ['inventory', 'stock', 'how much', 'reorder', 'bring', 'run out', 'enough', 'plan', 'supply'],
    priority: 2,
  },
  {
    id: 'pr-suppliers',
    label: 'Supplier Guidance',
    data: PRODUCTS_KNOWLEDGE.suppliers,
    keywords: ['supplier', 'supply', 'sunstone welders', 'order', 'imprinted', 'stuller', 'rio grande', 'where to buy'],
  },

  // ── BUSINESS STRATEGY ──
  {
    id: 'biz-pricing',
    label: 'Pricing Strategy',
    data: BUSINESS_STRATEGY_KNOWLEDGE.pricing,
    keywords: ['price', 'pricing', 'charge', 'how much', 'cost', 'tier', 'margin', 'discount', 'value'],
    priority: 2,
  },
  {
    id: 'biz-formation',
    label: 'Business Formation (LLC, sole prop)',
    data: BUSINESS_STRATEGY_KNOWLEDGE.businessFormation,
    keywords: ['llc', 'sole prop', 'business entity', 'legal', 'formation', 'register', 'ein'],
  },
  {
    id: 'biz-insurance',
    label: 'Insurance',
    data: BUSINESS_STRATEGY_KNOWLEDGE.insurance,
    keywords: ['insurance', 'liability', 'coverage', 'insure', 'protect'],
  },
  {
    id: 'biz-payment',
    label: 'Payment Processing',
    data: BUSINESS_STRATEGY_KNOWLEDGE.paymentProcessing,
    keywords: ['payment', 'stripe', 'credit card', 'cash', 'venmo', 'process', 'card reader', 'qr code', 'text link', 'text to pay', 'processing fee', 'how do customers pay', 'accept payment', 'charge customer'],
    priority: 2,
  },
  {
    id: 'biz-events',
    label: 'Event Strategy',
    data: BUSINESS_STRATEGY_KNOWLEDGE.eventStrategy,
    keywords: ['event', 'market', 'pop up', 'popup', 'festival', 'craft fair', 'booth', 'concert', 'venue', 'farmers'],
    priority: 2,
  },
  {
    id: 'biz-salon',
    label: 'Salon Integration',
    data: BUSINESS_STRATEGY_KNOWLEDGE.salonIntegration,
    keywords: ['salon', 'hair', 'spa', 'beauty', 'stylist', 'chair', 'commission', 'partnership', 'local business'],
  },
  {
    id: 'biz-houseparty',
    label: 'House Party Strategy',
    data: BUSINESS_STRATEGY_KNOWLEDGE.houseParties,
    keywords: ['house party', 'host', 'home', 'party', 'hostess', 'incentive'],
  },
  {
    id: 'biz-financial',
    label: 'Financial Potential',
    data: BUSINESS_STRATEGY_KNOWLEDGE.financialPotential,
    keywords: ['income', 'earn', 'money', 'revenue', 'potential', 'full time', 'part time', 'side hustle'],
  },

  // ── CLIENT EXPERIENCE ──
  {
    id: 'cx-flow',
    label: '12-Step Customer Experience Flow',
    data: CLIENT_EXPERIENCE_KNOWLEDGE.experienceFlow,
    keywords: ['experience', 'flow', 'step', 'customer journey', 'consultation', 'walk through', 'service flow', 'client flow'],
  },
  {
    id: 'cx-aftercare',
    label: 'Aftercare',
    data: CLIENT_EXPERIENCE_KNOWLEDGE.aftercare,
    keywords: ['aftercare', 'care', 'clean', 'maintain', 'tarnish', 'shower', 'pool', 'ocean', 'remove'],
  },
  {
    id: 'cx-safety',
    label: 'Safety',
    data: CLIENT_EXPERIENCE_KNOWLEDGE.safety,
    keywords: ['safety', 'eye', 'protection', 'burn', 'risk', 'glasses', 'mri', 'hospital'],
  },
  {
    id: 'cx-reweld',
    label: 'Re-Weld Policy',
    data: BUSINESS_STRATEGY_KNOWLEDGE.reWeldPolicy,
    keywords: ['reweld', 're-weld', 'broke off', 'fell off', 'came apart', 'warranty', 'free fix'],
  },
  {
    id: 'cx-waiver',
    label: 'Waiver Management',
    data: BUSINESS_STRATEGY_KNOWLEDGE.waiverManagement,
    keywords: ['waiver', 'sign', 'liability', 'form', 'consent', 'minor'],
  },

  // ── MARKETING ──
  {
    id: 'mk-brand',
    label: 'Branding Foundations',
    data: MARKETING_KNOWLEDGE.branding,
    keywords: ['brand', 'logo', 'name', 'identity', 'color', 'aesthetic', 'vibe'],
  },
  {
    id: 'mk-social',
    label: 'Social Media',
    data: MARKETING_KNOWLEDGE.socialMedia,
    keywords: ['social media', 'instagram', 'facebook', 'tiktok', 'post', 'content', 'reel', 'video', 'hashtag', 'follower'],
  },
  {
    id: 'mk-eventmarket',
    label: 'Event Marketing',
    data: MARKETING_KNOWLEDGE.eventMarketing,
    keywords: ['event market', 'promote event', 'advertise', 'find event', 'vendor', 'application', 'find pop'],
  },
  {
    id: 'mk-network',
    label: 'Networking',
    data: MARKETING_KNOWLEDGE.networking,
    keywords: ['network', 'connect', 'community', 'other artist', 'pjx', 'conference', 'expo', 'facebook group'],
  },
  {
    id: 'mk-packing',
    label: 'Event Packing Checklist',
    data: MARKETING_KNOWLEDGE.eventPackingChecklist,
    keywords: ['pack', 'checklist', 'bring', 'forget', 'what to bring', 'setup', 'table'],
  },

  // ── PJ UNIVERSITY ──
  {
    id: 'pju-structure',
    label: 'PJ University Courses & Fast Track',
    data: {
      pjUniversity: PJ_UNIVERSITY_AND_SUNNY_ROLE.pjUniversity,
      fastTrack: PJ_UNIVERSITY_AND_SUNNY_ROLE.fastTrack,
      mentoring: PJ_UNIVERSITY_AND_SUNNY_ROLE.mentoring,
    },
    keywords: ['pj university', 'course', 'class', 'module', 'certificate', 'certified', 'fast track', '30 day', 'mentoring', 'training'],
  },

  // ── PJOS PLATFORM GUIDE ──
  {
    id: 'app-getting-started',
    label: 'Getting Started with Sunstone Studio',
    data: PJOS_PLATFORM_GUIDE.gettingStarted,
    keywords: ['get started', 'getting started', 'set up', 'setup', 'onboard', 'new account', 'just signed up', 'first time', 'how to start', 'where do i begin', 'new to the app', 'create account', 'profile', 'business profile', 'upload logo', 'brand color', 'accent color', 'theme', 'pick a theme', 'change theme', 'skip setup'],
  },
  {
    id: 'app-events',
    label: 'Creating & Managing Events',
    data: PJOS_PLATFORM_GUIDE.events,
    keywords: ['create event', 'new event', 'add event', 'set up event', 'event setup', 'go live', 'event mode', 'start event', 'qr code', 'edit event', 'event tab', 'upcoming event', 'past event', 'event p&l', 'booth fee', 'how do i make an event'],
    priority: 1,
  },
  {
    id: 'app-event-pos',
    label: 'Event Mode POS — Ringing Up Sales',
    data: PJOS_PLATFORM_GUIDE.eventModePOS,
    keywords: ['ring up', 'ring someone up', 'sell', 'sale', 'checkout', 'charge', 'add to cart', 'cart', 'take payment', 'pos', 'point of sale', 'custom item', 'how to sell', 'complete sale', 'receipt', 'tip', 'discount', 'event mode pos', 'sales screen'],
    priority: 1,
  },
  {
    id: 'app-store-pos',
    label: 'Store Mode POS',
    data: PJOS_PLATFORM_GUIDE.storeModePOS,
    keywords: ['store mode', 'walk in', 'walk-in', 'walkin', 'not at event', 'everyday sale', 'salon sale', 'studio sale', 'shop sale', 'store sale'],
  },
  {
    id: 'app-inventory',
    label: 'Managing Inventory',
    data: PJOS_PLATFORM_GUIDE.inventory,
    keywords: ['add inventory', 'add item', 'add chain', 'add jump ring', 'chain list', 'my chains', 'inventory page', 'stock level', 'restock', 'reorder', 'low stock', 'deactivate', 'product type', 'material setup', 'chain pricing', 'buy by inch', 'sell by piece', 'how to add', 'movement history', 'sku'],
    priority: 1,
  },
  {
    id: 'app-clients',
    label: 'Client List & CRM',
    data: PJOS_PLATFORM_GUIDE.clients,
    keywords: ['client list', 'clients', 'customer list', 'crm', 'customer database', 'waiver history', 'add client', 'customer info', 'find client', 'client page', 'copy waiver link', 'waiver link'],
  },
  {
    id: 'app-messaging',
    label: 'Messages & Dedicated Phone Number',
    data: PJOS_PLATFORM_GUIDE.subscriptionAndBilling.crmAddOn,
    keywords: ['message', 'messages', 'text', 'sms', 'reply', 'conversation', 'dedicated number', 'phone number', 'business number', 'two way', 'inbox', 'unread', 'text back', 'reply to client', 'messaging', 'chat', 'two-way sms', 'call', 'calls', 'calling', 'voicemail', 'forward', 'ring', 'incoming call', 'phone call', 'mute calls', 'greeting', 'custom greeting', 'broadcast', 'broadcasts', 'workflow', 'workflows', 'automation', 'automate', 'sequence', 'aftercare', 'auto reply', 'auto-reply', 'sunny text', 'ai text', 'crm trial', 'crm add-on', 'crm addon'],
    priority: 2,
  },
  {
    id: 'app-crm-value',
    label: 'CRM Value & How Artists Use It',
    data: PJOS_PLATFORM_GUIDE.crmValue,
    keywords: ['crm', 'follow up', 'follow-up', 'repeat client', 'repeat customer', 'retention', 'keep clients', 'bring back', 'birthday text', 'campaign', 'broadcast', 'workflow', 'automated', 'automation', 'private party', 'party invite', 'girls night', 'why crm', 'is crm worth it', 'do i need crm', 'slow season', 'miss you text', 're-engagement', 'add-on', 'addon', 'crm add'],
    priority: 1,
  },
  {
    id: 'app-queue',
    label: 'Queue Management',
    data: PJOS_PLATFORM_GUIDE.queueManagement,
    keywords: ['queue', 'line', 'wait list', 'waitlist', 'check in', 'checkin', 'check-in', 'next customer', 'notify', 'notify next', 'get people checked in', 'how people check in', 'waiting', 'no show', 'served', 'who is next', 'sms', 'text notification', 'customer line'],
    priority: 1,
  },
  {
    id: 'app-waivers',
    label: 'Digital Waivers',
    data: PJOS_PLATFORM_GUIDE.digitalWaivers,
    keywords: ['waiver', 'digital waiver', 'sign waiver', 'signature', 'waiver link', 'send waiver', 'waiver pdf', 'download waiver', 'consent form', 'liability form', 'waiver before event', 'pre-event waiver', 'customize waiver'],
  },
  {
    id: 'app-reports',
    label: 'Business Reports',
    data: PJOS_PLATFORM_GUIDE.businessReports,
    keywords: ['report', 'reports', 'sales numbers', 'how much did i make', 'revenue', 'profit', 'p&l', 'profit and loss', 'csv', 'export', 'analytics', 'dashboard numbers', 'business data', 'where are my numbers', 'how is my business doing', 'sales report', 'event report'],
    priority: 1,
  },
  {
    id: 'app-payments',
    label: 'Payments & Checkout',
    data: PJOS_PLATFORM_GUIDE.paymentsAndCheckout,
    keywords: ['payment', 'pay', 'charge', 'checkout', 'qr code', 'text link', 'text to pay', 'stripe', 'card reader', 'no card reader', 'processing fee', 'how do customers pay', 'accept payment', 'pending payment', 'send payment', 'external payment', 'cash payment', 'venmo payment'],
    priority: 2,
  },
  {
    id: 'app-settings',
    label: 'Settings & Configuration',
    data: PJOS_PLATFORM_GUIDE.settingsGuide,
    keywords: ['settings', 'configure', 'setup', 'tax profile', 'tax rate', 'payment processor', 'connect stripe', 'business info', 'logo', 'waiver text', 'product types', 'materials', 'suppliers', 'fee handling', 'change settings', 'update settings'],
  },
  {
    id: 'app-subscription',
    label: 'Subscription & Billing',
    data: PJOS_PLATFORM_GUIDE.subscriptionAndBilling,
    keywords: ['subscription', 'plan', 'tier', 'starter', 'pro plan', 'business plan', 'upgrade', 'pricing', 'how much is', 'trial', 'free trial', 'trial expire', 'trial ending', 'billing', 'monthly', 'platform fee', 'cancel', 'downgrade', 'what plan am i on', 'cost of app', 'app price'],
    priority: 1,
  },
  {
    id: 'app-team',
    label: 'Team Management',
    data: PJOS_PLATFORM_GUIDE.teamManagement,
    keywords: ['team', 'invite', 'add team', 'team member', 'staff', 'manager', 'role', 'permission', 'add my girls', 'add my helper', 'add employee', 'remove member', 'how many people', 'team limit'],
  },
  {
    id: 'app-sunny',
    label: 'Using Sunny AI Mentor',
    data: PJOS_PLATFORM_GUIDE.askSunny,
    keywords: ['sunny', 'ai mentor', 'chat', 'ask question', 'question limit', 'how to use sunny', 'what can sunny do', 'sunny help', 'mentor chat', 'ai help'],
  },
  {
    id: 'app-gift-cards',
    label: 'Gift Cards',
    data: PJOS_PLATFORM_GUIDE.giftCards,
    keywords: ['gift card', 'gift certificate', 'voucher', 'redeem', 'gift code', 'sell gift', 'buy gift', 'gift card code', 'gift balance', 'gift card balance', 'apply gift card'],
    priority: 1,
  },
  {
    id: 'app-troubleshooting',
    label: 'App Troubleshooting',
    data: PJOS_PLATFORM_GUIDE.platformTroubleshooting,
    keywords: ['app problem', 'app issue', 'not working', 'can\'t connect', 'payment not working', 'stripe not working', 'inventory not updating', 'sms not sending', 'text not sending', 'qr not working', 'can\'t invite', 'reports not showing', 'app trouble', 'app broken', 'something wrong', 'app help', 'app error'],
    priority: 1,
  },
  {
    id: 'app-onboarding-kits',
    label: 'Onboarding Kit Auto-Populate & Pricing Setup',
    data: { starterKits: PJOS_PLATFORM_GUIDE.gettingStarted.starterKits, pricingOptions: PJOS_PLATFORM_GUIDE.gettingStarted.pricingOptions, onboardingFlow: PJOS_PLATFORM_GUIDE.gettingStarted.onboardingFlow },
    keywords: ['kit', 'momentum kit', 'dream kit', 'legacy kit', 'onboarding', 'kit contents', 'what came in my kit', 'what chains', 'loaded my kit', 'auto populate', 'pricing setup', 'how to price', 'price my jewelry', 'by type', 'by metal', 'by markup', 'price later', 'set prices'],
    priority: 1,
  },
  {
    id: 'app-sunny-tips',
    label: 'Sunny Tips & Dashboard Checklist',
    data: { sunnyTips: PJOS_PLATFORM_GUIDE.sunnyTips, dashboardChecklist: PJOS_PLATFORM_GUIDE.dashboardChecklist },
    keywords: ['sunny tips', 'tutorial', 'tips', 'getting started checklist', 'dashboard card', 'checklist', 'dismiss checklist', 'page tips', 'floating pill'],
  },
];

// ============================================================================
// Select relevant subsections (top 4-5 by keyword score)
// ============================================================================

const PAGE_NAMES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/dashboard/events': 'Events',
  '/dashboard/events/event-mode': 'Event Mode POS',
  '/dashboard/inventory': 'Inventory',
  '/dashboard/pos': 'Store Mode POS',
  '/dashboard/clients': 'Clients',
  '/dashboard/queue': 'Queue',
  '/dashboard/reports': 'Reports',
  '/dashboard/settings': 'Settings',
  '/dashboard/broadcasts': 'Broadcasts',
  '/dashboard/templates': 'Templates',
  '/onboarding': 'Onboarding',
};

function getPageName(pathname: string): string {
  return PAGE_NAMES[pathname] || pathname.split('/').pop() || 'Dashboard';
}

function selectSubsections(userMessage: string, recentMessages: string[]): Subsection[] {
  const searchText = [userMessage, ...recentMessages.slice(-2)]
    .join(' ')
    .toLowerCase();

  const scored = SUBSECTIONS.map(sub => {
    let score = 0;
    for (const keyword of sub.keywords) {
      if (searchText.includes(keyword.toLowerCase())) {
        score += keyword.length > 6 ? 3 : keyword.length > 3 ? 2 : 1;
      }
    }
    if (sub.priority && score > 0) {
      score += sub.priority;
    }
    return { sub, score };
  });

  scored.sort((a, b) => b.score - a.score);

  const selected = scored
    .filter(s => s.score > 0)
    .slice(0, 5)
    .map(s => s.sub);

  if (selected.length === 0) {
    return SUBSECTIONS.filter(s => s.id === 'biz-pricing' || s.id === 'biz-events');
  }

  return selected;
}

// ============================================================================
// Stringify a subsection's data compactly
// ============================================================================

function stringify(obj: any, depth = 0): string {
  const indent = '  '.repeat(depth);
  const lines: string[] = [];

  if (typeof obj === 'string') return `${indent}${obj}`;
  if (typeof obj === 'number' || typeof obj === 'boolean') return `${indent}${String(obj)}`;

  if (Array.isArray(obj)) {
    if (obj.length === 0) return '';
    if (typeof obj[0] === 'string' || typeof obj[0] === 'number') {
      return obj.map(item => `${indent}- ${item}`).join('\n');
    }
    return obj.map((item) => {
      if (typeof item === 'object' && item !== null) {
        return stringify(item, depth);
      }
      return `${indent}- ${item}`;
    }).join('\n');
  }

  if (typeof obj === 'object' && obj !== null) {
    for (const [key, value] of Object.entries(obj)) {
      const label = key
        .replace(/([A-Z])/g, ' $1')
        .replace(/[_]/g, ' ')
        .replace(/^\s/, '')
        .toUpperCase();

      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        lines.push(`${indent}${label}: ${value}`);
      } else if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'string') {
        lines.push(`${indent}${label}:`);
        value.forEach((v: string) => lines.push(`${indent}  - ${v}`));
      } else if (typeof value === 'object' && value !== null) {
        lines.push(`${indent}${label}:`);
        lines.push(stringify(value, depth + 1));
      }
    }
  }

  return lines.filter(Boolean).join('\n');
}

// ============================================================================
// Fetch RICH tenant context (inventory items, clients, events, queue)
// ============================================================================

async function fetchTenantContext(serviceClient: any, tenantId: string) {
  try {
    const [
      tenantRes,
      salesCountRes,
      clientsCountRes,
      eventsCountRes,
      inventoryRes,
      upcomingEventsRes,
      activeQueueRes,
      recentClientsRes,
    ] = await Promise.all([
      // Basic tenant info
      serviceClient
        .from('tenants')
        .select('name, subscription_tier, created_at')
        .eq('id', tenantId)
        .single(),

      // Total completed sales
      serviceClient
        .from('sales')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('status', 'completed'),

      // Total clients
      serviceClient
        .from('clients')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenantId),

      // Total events
      serviceClient
        .from('events')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenantId),

      // ACTUAL inventory items (chains, jump rings, charms, connectors)
      serviceClient
        .from('inventory_items')
        .select('name, type, material, quantity_on_hand, sell_price, cost_per_unit, supplier, reorder_threshold, unit, is_active')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .order('type')
        .order('name'),

      // Upcoming events (next 30 days)
      serviceClient
        .from('events')
        .select('name, location, start_time, end_time, booth_fee')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .gte('start_time', new Date().toISOString())
        .lte('start_time', new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString())
        .order('start_time')
        .limit(5),

      // Active queue entries (waiting or notified)
      serviceClient
        .from('queue_entries')
        .select('name, status, position')
        .eq('tenant_id', tenantId)
        .in('status', ['waiting', 'notified'])
        .order('position')
        .limit(20),

      // Recent clients (last 10)
      serviceClient
        .from('clients')
        .select('first_name, last_name, created_at')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(10),
    ]);

    const tenant = tenantRes.data;
    const inventory = inventoryRes.data || [];
    const upcomingEvents = upcomingEventsRes.data || [];
    const activeQueue = activeQueueRes.data || [];
    const recentClients = recentClientsRes.data || [];

    // Format inventory by type
    const chains = inventory.filter((i: any) => i.type === 'chain');
    const jumpRings = inventory.filter((i: any) => i.type === 'jump_ring');
    const charms = inventory.filter((i: any) => i.type === 'charm');
    const connectors = inventory.filter((i: any) => i.type === 'connector');

    const formatItem = (i: any) => {
      const qty = Number(i.quantity_on_hand) || 0;
      const price = Number(i.sell_price) || 0;
      const costPerUnit = Number(i.cost_per_unit) || 0;
      const unit = i.unit === 'ft' ? 'ft' : i.unit === 'each' ? 'ea' : i.unit;
      const mat = i.material ? ` (${i.material})` : '';
      const sup = i.supplier ? `, supplier: ${i.supplier}` : '';
      const costStr = costPerUnit > 0 ? `, $${costPerUnit.toFixed(2)}/in cost` : '';
      const reorder = i.reorder_threshold ? `, reorder at ${i.reorder_threshold}${unit}` : '';
      return `${i.name}${mat}: ${qty}${unit} on hand${costStr}, $${price.toFixed(2)} sell price${sup}${reorder}`;
    };

    const inventoryText = [
      chains.length > 0 ? `Chains (${chains.length}):\n${chains.map(formatItem).join('\n')}` : 'Chains: None in inventory',
      jumpRings.length > 0 ? `Jump Rings (${jumpRings.length}):\n${jumpRings.map(formatItem).join('\n')}` : 'Jump Rings: None in inventory',
      charms.length > 0 ? `Charms (${charms.length}):\n${charms.map(formatItem).join('\n')}` : 'Charms: None in inventory',
      connectors.length > 0 ? `Connectors (${connectors.length}):\n${connectors.map(formatItem).join('\n')}` : 'Connectors: None in inventory',
    ].join('\n');

    const eventsText = upcomingEvents.length > 0
      ? upcomingEvents.map((e: any) => {
          const start = new Date(e.start_time);
          const end = e.end_time ? new Date(e.end_time) : null;
          const dur = end ? `${Math.round((end.getTime() - start.getTime()) / 3600000)}h` : '';
          return `${e.name} - ${e.location || 'TBD'} on ${start.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} ${dur} (booth fee: $${e.booth_fee || 0})`;
        }).join('\n')
      : 'No upcoming events scheduled';

    const queueText = activeQueue.length > 0
      ? `${activeQueue.length} people in queue: ${activeQueue.map((q: any) => `${q.name} (${q.status})`).join(', ')}`
      : 'No active queue';

    const clientsText = recentClients.length > 0
      ? `Recent: ${recentClients.map((c: any) => `${c.first_name || ''} ${c.last_name || ''}`.trim() || 'Unnamed').join(', ')}`
      : 'No clients yet';

    return {
      businessName: tenant?.name || 'Your Business',
      tier: tenant?.subscription_tier || 'starter',
      since: tenant?.created_at ? new Date(tenant.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : 'recently',
      sales: salesCountRes.count || 0,
      clientCount: clientsCountRes.count || 0,
      eventCount: eventsCountRes.count || 0,
      inventoryText,
      eventsText,
      queueText,
      clientsText,
    };
  } catch (error) {
    console.error('[Mentor] Error fetching tenant context:', error);
    return {
      businessName: 'Your Business',
      tier: 'starter',
      since: 'recently',
      sales: 0,
      clientCount: 0,
      eventCount: 0,
      inventoryText: 'Unable to load inventory',
      eventsText: 'Unable to load events',
      queueText: 'Unable to load queue',
      clientsText: 'Unable to load clients',
    };
  }
}

// ============================================================================
// POST handler
// ============================================================================

const MENTOR_RATE_LIMIT = { prefix: 'mentor', limit: 20, windowSeconds: 60 };

export async function POST(request: NextRequest) {
  try {
    // 1. Auth
    const supabase = await createServerSupabase();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // 1b. Rate limit
    const rl = checkRateLimit(user.id, MENTOR_RATE_LIMIT);
    if (!rl.allowed) {
      return NextResponse.json({ error: 'Too many requests. Please wait a moment.' }, { status: 429 });
    }

    // 2. Tenant
    const serviceClient = await createServiceRoleClient();
    const { data: membership } = await serviceClient
      .from('tenant_members')
      .select('tenant_id')
      .eq('user_id', user.id)
      .limit(1)
      .single();

    const tenantId = membership?.tenant_id;
    if (!tenantId) {
      return NextResponse.json({ error: 'No tenant found' }, { status: 400 });
    }

    // 2b. SUBSCRIPTION GATE — meter Sunny questions for Starter
    const { data: tenantData } = await serviceClient
      .from('tenants')
     .select('subscription_tier, subscription_status, trial_ends_at, subscription_period_end, sunny_questions_used, sunny_questions_reset_at')
      .eq('id', tenantId)
      .single();

    const effectiveTier = tenantData ? getSubscriptionTier(tenantData) : 'starter';
    const questionLimit = getSunnyQuestionLimit(effectiveTier);

    if (questionLimit !== Infinity && tenantData) {
      let questionsUsed = tenantData.sunny_questions_used || 0;
      const resetAt = tenantData.sunny_questions_reset_at
        ? new Date(tenantData.sunny_questions_reset_at)
        : null;
      const now = new Date();

      // Reset counter if we've rolled into a new month
      if (!resetAt || resetAt.getMonth() !== now.getMonth() || resetAt.getFullYear() !== now.getFullYear()) {
        questionsUsed = 0;
        await serviceClient
          .from('tenants')
          .update({
            sunny_questions_used: 0,
            sunny_questions_reset_at: now.toISOString(),
          })
          .eq('id', tenantId);
      }

      if (questionsUsed >= questionLimit) {
        return NextResponse.json(
          {
            error: 'limit_reached',
            message: `You've used all ${questionLimit} Sunny questions this month. Upgrade to Pro for unlimited access.`,
            questions_used: questionsUsed,
            questions_limit: questionLimit,
          },
          { status: 429 }
        );
      }
    }

    // 3. Parse
    const body = await request.json();
    const { messages, currentPage } = body as { messages: Array<{ role: 'user' | 'assistant'; content: string }>; currentPage?: string };
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: 'Messages required' }, { status: 400 });
    }

    // 4. Select relevant knowledge subsections
    const latestUserMsg = messages.filter(m => m.role === 'user').pop()?.content || '';
    const recentUserMsgs = messages.filter(m => m.role === 'user').slice(-3).map(m => m.content);
    const subsections = selectSubsections(latestUserMsg, recentUserMsgs);

    const knowledgeText = subsections
      .map(s => `[${s.label}]\n${stringify(s.data)}`)
      .join('\n\n');

    // 5. Fetch RICH tenant context + approved additions + Shopify catalog
    const [biz, additionsRes, shopifyCatalog] = await Promise.all([
      fetchTenantContext(serviceClient, tenantId),
      serviceClient.from('mentor_knowledge_additions').select('question, answer').eq('is_active', true),
      getCachedCatalog().catch(() => null),
    ]);

    const catalogText = shopifyCatalog ? formatCatalogForPrompt(shopifyCatalog) : '';

    const additions = (additionsRes.data || []);
    const additionsText = additions.length > 0
      ? `\n\n[Additional Learned Knowledge]\n${additions.map((a: any) => `Q: ${a.question}\nA: ${a.answer}`).join('\n')}`
      : '';

    // 6. System prompt — BEHAVIOR FIRST, knowledge second
    const systemPrompt = `You are Sunny, the AI mentor for Sunstone Permanent Jewelry, inside Sunstone Studio.

⚠️⚠️⚠️ HOW YOU COMMUNICATE — THIS IS THE #1 RULE ⚠️⚠️⚠️
You are texting a friend who happens to be a permanent jewelry expert. Keep it casual, warm, and SHORT.

RESPONSE LENGTH:
- Default to 2-3 sentences. That's it.
- Only go longer if the question genuinely requires it (like a full pricing strategy walkthrough or bulk inventory setup).
- If a topic COULD be long, give the short version first, then ask: "Want me to go deeper on any of that?"
- Never give 5 bullet points when 2 will do.
- Never give a numbered list when a sentence will do.
- Never repeat back what the user just said.
- Never add "bonus tips" or "also keep in mind" or "one more thing" unless asked.

FORMATTING:
- Use plain conversational text, not formatted reports.
- Minimal bullet points. Prefer short paragraphs.
- No headers or section titles in casual conversation.
- Bold only for emphasis on one or two key words, not entire phrases.
- One emoji max per message, and only when it feels natural.

TONE:
- Warm, confident, casual. Like a mentor who respects your time.
- "Here's what I'd do" not "Here are 7 considerations to keep in mind."
- Brevity is respect. Match the user's energy — quick question, quick answer.

⚠️ CRITICAL — CHAIN IS ALWAYS IN INCHES (READ THIS FIRST — NON-NEGOTIABLE):
Chain inventory is ALWAYS measured in inches. NEVER ask the artist about units — feet, inches, or pieces.
If they say "360" it means 360 inches. If they say "10 feet", silently convert to 120 inches.
If they say "30 foot spool", that's 360 inches. This is permanent jewelry industry standard and is not negotiable.
Do not ask clarifying questions about units. The unit for chain is ALWAYS "in". Jump rings and connectors use "each".
When adding or updating chain inventory, ALWAYS use unit "in" and store the value in inches. No exceptions.

⚠️ COMPANY NAME:
The company is called Sunstone or Sunstone Welders. NEVER say "Sunstone Supply" — that company does not exist.

⚠️ PAYMENT MODEL (READ THIS):
Sunstone Studio has built-in Stripe payments. Customers pay by scanning a QR code or tapping a text link — no card reader needed.
The processing fee is added to the CUSTOMER's checkout total. The artist keeps their full sale amount. Rates: Starter 3%, Pro 1.5%, Business 0%.
NEVER say the artist pays the fee. NEVER recommend Square as a payment processor inside the app. If asked about card readers, explain that no hardware is needed.
External payments (cash, Venmo, personal card reader) can be recorded in the POS under "Record External Payment" but don't go through Stripe.

⚠️ PRICING MODEL — PER-PRODUCT FLAT PRICING (READ THIS):
Chains use per-product flat pricing. Each chain stores separate prices for bracelet, anklet, ring, and necklace (necklace is per-inch). When an artist says "2.5x markup", calculate the flat price for each product type using: default_length × cost_per_inch × markup. Standard default lengths: bracelet 7", anklet 10", ring 2.5", necklace priced per inch. Set the flat product price, not a per-inch sell price.
When adding or updating inventory with pricing, calculate ALL product type prices automatically using standard lengths (bracelet 7in, anklet 10in, ring 2.5in, necklace per-inch). Present the full breakdown in your confirmation. Don't make the artist ask separately for each product type.

⚠️ INVENTORY REQUIRED FIELDS:
Every inventory item MUST have these 7 fields before creation:
1. name — chain/item name (e.g. "Chloe", "Lincoln")
2. material — metal type (e.g. "14K Gold Fill", "Sterling Silver", "Stainless Steel")
3. supplier — where they buy it (e.g. "Sunstone Welders", "Stuller", "Rio Grande")
4. cost_per_inch — what the artist pays per inch
5. quantity — how much they have on hand (in inches for chain)
6. reorder_point — when to reorder (e.g. 120 inches)
7. type — chain, jump_ring, charm, or connector (defaults to "chain")
If the artist provides some but not all, ask for the missing ones BEFORE creating the item. Do NOT create an item with missing required fields.

⚠️ TIERED PRICING BY METAL TYPE:
When an artist says "I want 2.5x markup on all my gold fill chains":
1. Look up ALL chains in their inventory where material contains "gold fill" (or the specified metal)
2. For EACH matching chain, calculate per-product-type prices: bracelet = default_inches × cost_per_inch × markup, anklet = default_inches × cost_per_inch × markup, ring = default_inches × cost_per_inch × markup, necklace = cost_per_inch × markup (per inch)
3. Present a summary table showing all chains and their calculated prices BEFORE executing
4. After confirmation, call update_inventory_item once per chain with the calculated prices
Example: Chloe (14K GF) costs $4.20/in, 2.5x markup → bracelet $73.50, anklet $105.00, ring $26.25, necklace $10.50/in

⚠️ ONBOARDING INVENTORY SETUP:
When a new artist wants to set up their inventory, guide them step by step:
1. Ask what chains they have — get names and materials
2. For each chain, ask: supplier, cost per inch, quantity on hand, reorder point
3. Ask about their markup strategy — do they want a flat markup across all chains, or different markups by metal type?
4. Calculate and present all product type prices in a summary table
5. Confirm before creating each item
Group by metal type when possible (e.g. "Let's start with your gold fill chains, then silver").

⚠️ STARTER KIT REFERENCE (MEMORIZE THIS):
When an artist says "add my Dream kit", "add starter kit chains", or mentions any kit by name:
- Supplier: ALWAYS "Sunstone Welders" — kits only come from Sunstone. DO NOT ask.
- Quantity per chain: ALWAYS 36 inches (3 feet) — standard for ALL kits. DO NOT ask.
- DO NOT ask what supplier. DO NOT ask quantity. DO NOT ask units. You KNOW this.
- Only ask for: reorder point and pricing strategy (markup multiplier, flat prices by product type, or "set later")
- Use the known cost_per_inch values below. Only search the catalog for chains marked "search catalog".
- For any chain where the catalog doesn't return a price, use $2.50/inch as default and TELL the artist which ones you estimated
- NOTE: "Lavina" and "Lavinia" are the SAME chain — both spellings are correct. The catalog lists it as "Lavinia". When a user asks about either spelling, treat them as the same product.

MOMENTUM KIT ($2,399) — 7 chains:
  Chloe (14K Gold Fill) — search catalog for cost
  Olivia (14K Gold Fill) — $1.60/inch
  Maria (14K Gold Fill) — $2.25/inch
  Marlee (14K White Gold Fill) — $2.127/inch
  Lavina/Lavinia (Sterling Silver) — $1.68/inch (catalog lists as "Lavinia")
  Ella (Sterling Silver) — search catalog for cost
  Paisley (Sterling Silver) — $1.23/inch

DREAM KIT ($3,199 — HERO, most recommended) — 9 chains:
  All 7 Momentum chains PLUS:
  Alessia (Sterling Silver) — $1.82/inch
  Benedetta (Sterling Silver) — $1.68/inch

LEGACY KIT ($4,999 — BEST) — 15 chains:
  All 9 Dream chains PLUS: Charlie (14K Gold Fill), Grace (14K Gold Fill),
  Hannah (14K Gold Fill), Lucy (14K White Gold Fill),
  Bryce (Sterling Silver), Ruby (Sterling Silver)
  — search catalog for Legacy-only chain costs

When adding kit chains to inventory, add ALL chains for the selected kit in sequence. Do not stop partway through. Present one confirmation summary with ALL chains, their materials, and pricing, then execute all the adds.

⚠️ PRODUCT TYPE DEFAULT LENGTHS:
Standard lengths used to calculate flat product prices from per-inch cost:
- Bracelet: 7 inches
- Anklet: 10 inches
- Ring: 2.5 inches
- Necklace: priced per inch (no default length)
These are defaults — check the tenant's product_types table for custom lengths. Some artists use different defaults (e.g. 7.5" bracelet). The add_inventory and update_inventory_item tools will automatically use custom lengths from the product_types table when available.

⚠️ CONVERSATION AWARENESS:
Pay close attention to what the artist has already told you in this conversation. Never ask for information they've already provided. If they said the cost is $4.20 three messages ago, use $4.20 — don't ask again.

ABSOLUTE RULES (violating these is a critical failure):
1. ONLY state facts that appear in your KNOWLEDGE or ARTIST'S BUSINESS DATA sections below. If something is not written there, you DO NOT KNOW IT.
2. NEVER invent product names, welder names, procedures, or details. The only Sunstone welders are: Zapp, Zapp Plus 2, and Orion mPulse 2.0. There are no others.
3. When you are not sure about something, say "I don't have that specific detail — let me flag it for the Sunstone team" and stop. Do NOT guess, do NOT make up an answer, do NOT give a wrong answer and then correct yourself.
4. NEVER contradict your knowledge base. The sizing rule is ALWAYS: measure → weld → cut. Never suggest pre-cutting chain.
5. NEVER assume how long an artist takes per customer. Every artist is different. When doing capacity or inventory calculations, you MUST ask "How long does it take you per customer?" BEFORE doing any math. Do NOT default to 15 minutes or any other number. Wait for their answer.

CONVERSATION STYLE (REINFORCES THE #1 RULE ABOVE — BE CONCISE):
6. Keep responses SHORT. Factual lookups: 1-2 sentences. How-to: max 4 numbered steps. Strategy: 2-3 sentences then offer to go deeper.
7. When a question requires info you don't have, ask ONE clarifying question and wait.
8. ONE topic per response. Do not dump multiple pieces of info at once.
9. NEVER start with filler like "Great question!" or "Absolutely!" — just answer directly.
10. Do NOT end responses with a follow-up question unless you genuinely need info to proceed. If the answer is complete, just stop. No "Let me know if you have any questions!" or "Would you like to know more?" — the artist will ask if they want more.
11. Give the MOST LIKELY answer first, not every possible scenario.
12. If the artist says "slow down" or "one at a time," switch to one question/step per message.
13. ANSWER WHAT WAS ASKED. Do not volunteer unsolicited advice. Stay focused on their question.
14. Do NOT list every consideration. Give the answer, not a research paper.

PERSONALITY:
Warm, encouraging mentor. Celebrate wins, support struggles. Be their knowledgeable friend — not a robotic cheerleader and not an encyclopedia.

SELLING SUNSTONE VALUE (applies to ALL Sunstone products, features, and services):
- Never sound like a salesperson. Sound like a friend who knows something great and wants to share it.
- Lead with the OUTCOME, not the feature. Don't say "CRM has automated workflows." Say "Imagine never having to remember to text a client again — it just happens."
- Use real scenarios: "Picture this — you just finished a market, you're exhausted, but every single customer already got a thank-you text. That's what this does."
- Acknowledge their reality: "I know following up with every client feels impossible when you're also running your business, packing for events, and trying to have a life."
- When explaining why something costs money, frame it as investment vs. expense: "Artists who follow up consistently see 3-4x more repeat clients. That's not a cost, that's your highest-ROI marketing."
- Never pressure. Always frame as "when you're ready" or "something to think about as your business grows."
- For equipment: focus on what it lets them DO, not specs. "The mPulse gives you TruFire so you never miss a weld in front of a customer — that confidence is everything at a busy event."
- For kits: focus on the feeling of being prepared. "Having everything you need in one box means your first event is exciting, not stressful."
- For PJ University: "It's like having a mentor walk you through everything — pricing, events, client experience — so you skip the mistakes most artists make in year one."
- Always be honest. If something isn't right for them yet, say so: "You might not need CRM right now if you're just starting out — focus on your first few events and it'll be here when you're ready."

KNOWLEDGE (relevant to this question):
${knowledgeText}${additionsText}

ARTIST'S BUSINESS DATA (from their Sunstone Studio account — you CAN see this):
Business: ${biz.businessName} | ${biz.tier} plan | Member since ${biz.since}
Sales: ${biz.sales} completed | Clients: ${biz.clientCount} total | Events: ${biz.eventCount} hosted

INVENTORY:
${biz.inventoryText}

UPCOMING EVENTS:
${biz.eventsText}

QUEUE:
${biz.queueText}

RECENT CLIENTS:
${biz.clientsText}

IMPORTANT — ABOUT BUSINESS DATA ACCESS:
You DO have access to this artist's inventory, events, queue, and client data — it is shown above. Use it when relevant. If the artist asks "can you see my inventory?" the answer is YES. Reference their actual chain names, quantities, and prices when giving recommendations. If a data section says "None in inventory" or "No upcoming events," tell them that honestly.

${currentPage ? `CURRENT PAGE CONTEXT:\nThe artist is currently on the ${getPageName(currentPage)} page. If their question seems related to what they are looking at, tailor your answer to that context. For example, if they are on the Inventory page and ask "how do I add a chain," give inventory-specific guidance.\n` : ''}GUIDELINES:
- Use SPECIFIC numbers from knowledge (joule values, prices, kit contents).
- Bold key numbers/settings with markdown.
- Reference their actual inventory by name when planning events or recommending what to bring.
- NEVER recommend discounting.
- NEVER say it's okay to skip eye protection.
- Competitors: help generically, no trash talk, don't troubleshoot their hardware.
- Refer to Sunstone support (385-999-5240) if you can't resolve in 2-3 attempts.

${catalogText ? `SUNSTONE CATALOG SUMMARY (${shopifyCatalog?.products?.length || 0} products synced from Shopify):\nYou have access to the full Sunstone product catalog via the search_sunstone_catalog tool. Use it for ALL product questions.\nQuick reference of product categories available: ${[...new Set((shopifyCatalog?.products || []).map((p: any) => p.productType).filter(Boolean))].join(', ') || 'various'}\n` : 'SUNSTONE CATALOG: Not currently synced. If an artist asks about Sunstone products, suggest they check sunstonewelders.com.\n'}
⚠️ PRODUCT RECOMMENDATIONS (READ THIS — CRITICAL):
You MUST use the search_sunstone_catalog tool BEFORE answering ANY product question — pricing, recommendations, availability, or specific product lookups. NEVER make up product names, prices, or URLs. Only reference products returned by the tool.
Do NOT mention this limitation or say "I can only recommend Sunstone products." You are a Sunstone mentor — naturally recommend from the Sunstone catalog like a store employee who knows their inventory.
If a product is not found in the catalog, say something like: "I'm not seeing that one in the current Sunstone lineup — want me to show you what's available in [that category/metal type]?"

FOR BROAD QUESTIONS ("recommend chains", "what should I stock", "I need more inventory"):
1. Ask ONE clarifying question first: "What are you looking for? Want to add variety to your current selection, stock up on best sellers, or find styles for a particular type of event?"
2. Wait for their answer
3. THEN search the catalog with search_sunstone_catalog and give 5 specific recommendations with: product name, price range, and a brief one-line reason why it's a good fit
4. Include product cards by adding <!-- PRODUCT_SEARCH: search terms --> at the END of your response
5. End with a natural call-to-action like "Click any product to shop at Sunstone!"
6. ALWAYS suggest ONE complementary add-on (connectors, charms, or jump rings that pair well). Frame it naturally: "These [product name] go beautifully with these chains — want me to pull up the link?"

FOR DIRECT QUESTIONS ("give me the link to the silver Aspen chain", "how much is the Chloe chain?"):
1. Search the catalog immediately with search_sunstone_catalog — do NOT ask clarifying questions
2. Give the answer right away with product info and include <!-- PRODUCT_SEARCH: exact product name --> for the card
3. Add ONE simple follow-up suggestion: "Want jump rings to go with that?" or "Need connectors for this chain too?"
4. That's it. Don't over-explain or lecture.

CHAIN PRICING CONTEXT:
Catalog price ranges include per-inch pricing (low end) and full spool pricing (high end). When discussing chain costs, always clarify: "The per-inch cost is $X.XX" — don't show the full range without explanation. The per-inch price is what matters for inventory cost calculations. Look at the cheapest variant price — that's typically the per-inch cost.

VARIANT ACCURACY:
Many chains have multiple variants (gold fill, sterling silver, enamel, different lengths). When a user asks about a SPECIFIC variant (e.g. "Lavina in Sterling Silver"), only describe that variant's characteristics. Do NOT describe a different variant (e.g. don't mention "pink enamel" when they asked about sterling silver). Match the metal/material the user specified.

PRODUCT CARD DISPLAY:
- For direct product questions: show cards immediately with the answer
- For recommendation flows: show cards AFTER the conversational back-and-forth, when presenting final recommendations
- Maximum 5 product cards unless they ask for more
- To show product cards, include at END of response: <!-- PRODUCT_SEARCH: descriptive search terms -->

KNOWLEDGE GAP:
If you cannot answer from knowledge, include at END:
<!-- KNOWLEDGE_GAP: {"category": "unknown_answer", "topic": "welding", "summary": "brief"} -->
Categories: unknown_answer, correction, product_gap, technique_question, other
Topics: welding, equipment, business, products, marketing, troubleshooting, client_experience, other

TOOL USE:
You have tools to read and modify the artist's business data. Use them when asked to DO something (check inventory, send a message, create an event, look up revenue, manage clients) rather than describing app navigation.
You can also edit clients, events, templates, workflows, and inventory items. You can create new templates and workflows. You can cancel or delete events and deactivate inventory.
CATALOG SEARCH: Use search_sunstone_catalog for ALL product questions. Search by name, metal type, category, or keyword. The tool searches 281+ products from the live Shopify catalog cached in the database.
CONFIRMATION REQUIRED: For send_message, send_bulk_message, and any update/delete tool, describe what you'll do and ask to confirm before executing. For destructive actions (delete_event, delete_inventory_item), ask "Are you sure?" with extra caution.
INVENTORY UPDATES: When updating inventory (cost, price, length), use the update_inventory_item tool and search by name. REMINDER: Chain quantities are ALWAYS in inches. When an artist provides cost and markup, auto-calculate all product type prices (bracelet, anklet, ring, necklace) and include them in the update_inventory_item call. When updating multiple items, call the tool once per item.
ADDING INVENTORY: When adding inventory, ALL required fields must be provided: name, material, supplier, cost_per_inch, quantity, reorder_point. If any are missing, ask the artist before creating. Do NOT create partial items. EXCEPTION: For starter kit chains, you already know supplier (Sunstone Welders) and quantity (36 inches) — only ask for reorder point and pricing strategy.
MARKUP BY METAL TYPE: When an artist provides markup by metal type (e.g. "2.5x on all gold fill"), look up all chains of that metal, calculate per-product prices for each, and present a summary table before executing. Then call update_inventory_item once per chain.
After a tool executes, summarize the result naturally. If a tool errors, explain simply and suggest what the artist can do instead.`;

    // 7. Call Anthropic via agentic loop (tools + non-streaming)
    const toolCtx = { serviceClient, tenantId, userId: user.id };

    let agenticResult;
    try {
      console.log(`[Mentor] Starting agentic loop for tenant ${tenantId}, ${messages.length} messages`);
      agenticResult = await runAgenticLoop({
        model: 'claude-sonnet-4-20250514',
        maxTokens: 1024,
        systemPrompt,
        messages: messages.slice(-10),
        tools: SUNNY_TOOL_DEFINITIONS,
        executeTool: (name, input) => executeSunnyTool(name, input, toolCtx),
        maxIterations: 15,
        getToolStatusLabel: getSunnyToolStatusLabel,
      });
      console.log(`[Mentor] Agentic loop completed: ${agenticResult.toolStatusEvents.length} tool(s) used, response length: ${agenticResult.fullResponseText.length}`);
    } catch (err: any) {
      console.error('[Mentor] Agentic loop error:', err?.message, err?.stack);
      return NextResponse.json(
        { error: `AI service error: ${err?.message || 'unknown'}` },
        { status: 502 }
      );
    }

    const { fullResponseText, toolStatusEvents, usage } = agenticResult;

    // 7b. Log Anthropic cost (fire-and-forget)
    logAnthropicCost({
      tenantId,
      operation: 'mentor_chat',
      model: 'claude-sonnet-4-20250514',
      usage,
    });

    // 8. Post-response: increment question counter for Starter
    if (questionLimit !== Infinity) {
      try {
        await serviceClient.rpc('increment_sunny_questions', { p_tenant_id: tenantId });
      } catch {
        const currentUsed = tenantData?.sunny_questions_used || 0;
        await serviceClient
          .from('tenants')
          .update({ sunny_questions_used: currentUsed + 1 })
          .eq('id', tenantId);
      }
    }

    // 9. Post-response: gap detection
    try {
      const gapMatch = fullResponseText.match(/<!--\s*KNOWLEDGE_GAP:\s*(\{[^}]+\})\s*-->/);
      if (gapMatch) {
        const gapData = JSON.parse(gapMatch[1]);
        const cleanResponse = fullResponseText
          .replace(/<!--\s*KNOWLEDGE_GAP:.*?-->/g, '')
          .replace(/<!--\s*PRODUCT_SEARCH:.*?-->/g, '')
          .trim();

        await serviceClient.from('mentor_knowledge_gaps').insert({
          tenant_id: tenantId,
          user_id: user.id,
          user_message: latestUserMsg,
          sunny_response: cleanResponse,
          category: gapData.category || 'other',
          topic: gapData.topic || 'other',
          status: 'pending',
        });
      }
    } catch (gapError) {
      console.error('[Mentor] Gap detection error:', gapError);
    }

    // 10. Build simulated SSE stream
    const stream = buildAgenticSSEStream(fullResponseText, toolStatusEvents);

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    console.error('[Mentor] Route error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}