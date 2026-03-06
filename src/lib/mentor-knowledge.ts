// =============================================================================
// SUNSTONE PJOS — Sunny AI Mentor Knowledge Base
// =============================================================================
// This file contains the structured knowledge that powers "Sunny," the AI mentor
// embedded in the Sunstone Permanent Jewelry Operating System (PJOS).
//
// Compiled from 45+ official Sunstone documents, training materials, and
// founder interviews. This is the single source of truth for Sunny's responses.
//
// Last updated: 2026-03-03
// =============================================================================

// =============================================================================
// SECTION 1: EQUIPMENT & SETTINGS
// =============================================================================
export const EQUIPMENT_KNOWLEDGE = {
  // ---------------------------------------------------------------------------
  // Welders
  // ---------------------------------------------------------------------------
  welders: {
    zapp: {
      name: 'Zapp',
      type: 'Entry-level micro TIG welder',
      interface: 'Knob controls',
      includedInKit: 'Momentum ($2,399)',
      notes: [
        'Good starter welder for artists entering the industry.',
        'Uses lowest/max power settings for many 20g and 26g jump rings rather than precise joule values.',
        'Does not include 1:1 mentoring in the Momentum kit.',
      ],
    },
    zappPlus2: {
      name: 'Zapp Plus 2',
      type: 'Mid-tier micro TIG welder',
      interface: 'Touchscreen controls',
      includedInKit: 'Dream ($3,199 — HERO kit)',
      notes: [
        'Touchscreen interface for easier adjustment.',
        'Most popular welder — included in the recommended Dream kit.',
        'Precise joule settings across all gauges and metals.',
        'Available for rental through Sunstone OnDemand program.',
      ],
    },
    mPulse: {
      name: 'Orion mPulse 2.0',
      type: 'Premium micro TIG welder',
      interface: 'Touchscreen controls with TruFire technology',
      includedInKit: 'Legacy ($4,999 — BEST kit)',
      truFire: {
        description:
          'TruFire initiates the arc while the electrode is still retracting from the piece, rather than waiting until retraction is complete. This millisecond difference creates a low-voltage pre-arc that maintains connection, making welds more consistent and harder to accidentally abort.',
        sunnyGuidance:
          'Do NOT explain TruFire mechanics unprompted. Artists who switch from another welder to the mPulse will notice more consistent welds naturally. If asked directly, you can explain it helps maintain the connection during the weld cycle for more reliable results.',
      },
      notes: [
        'Generally runs at lower joule settings than Zapp and Zapp Plus across all metals.',
        'Premium option for artists who want the best consistency.',
        'Available for rental through Sunstone OnDemand program.',
      ],
    },
  },

  // ---------------------------------------------------------------------------
  // Starter Kits
  // ---------------------------------------------------------------------------
  starterKits: {
    momentum: {
      name: 'Momentum',
      price: '$2,399',
      welder: 'Zapp',
      pjUniversity: true,
      oneOnOneMentoring: false,
      argonMinis: 2,
      regulator: 1,
      pjToolKit: true,
      jumpRings: { silver: 25, goldFilled: 25 },
      bsConnectors: false,
      displayCase: false,
      chainTotal: '21ft (7 chains × 3ft each)',
      chains: ['Chloe', 'Olivia', 'Marlee', 'Lavina', 'Ella', 'Paisley', 'Maria'],
    },
    dream: {
      name: 'Dream',
      price: '$3,199',
      designation: 'HERO kit — most recommended',
      welder: 'Zapp Plus 2',
      pjUniversity: true,
      oneOnOneMentoring: true,
      argonMinis: 2,
      regulator: 1,
      pjToolKit: true,
      jumpRings: { silver: 50, goldFilled: 50 },
      bsConnectors: true,
      displayCase: true,
      chainTotal: '27ft (9 chains × 3ft each)',
      chains: ['Chloe', 'Olivia', 'Marlee', 'Lavina', 'Ella', 'Paisley', 'Maria', 'Alessia', 'Benedetta'],
    },
    legacy: {
      name: 'Legacy',
      price: '$4,999',
      designation: 'BEST kit — premium option',
      welder: 'Orion mPulse 2.0',
      pjUniversity: true,
      oneOnOneMentoring: true,
      argonMinis: 4,
      regulator: 1,
      pjToolKit: true,
      jumpRings: { silver: 100, goldFilled: 100 },
      bsConnectors: true,
      displayCase: true,
      chainTotal: '45ft (15 chains × 3ft each)',
      chains: [
        'Chloe', 'Olivia', 'Marlee', 'Lavina', 'Ella', 'Paisley', 'Maria',
        'Alessia', 'Benedetta', 'Charlie', 'Lucy', 'Grace', 'Bryce', 'Hannah', 'Ruby',
      ],
    },
    salesCallTipOrder: [
      'Welder (what it does, why it matters)',
      'Mentoring (Dream/Legacy include 1:1 access)',
      'Argon minis (how many included)',
      'Chain footage (variety to get started)',
      'BS connectors + display case (Dream/Legacy)',
      'Jump rings (quantity included)',
    ],
  },

  // ---------------------------------------------------------------------------
  // Argon Setup
  // ---------------------------------------------------------------------------
  argon: {
    gasType: 'Pure argon only — NEVER use 75/25 MIG mix',
    flowRate: {
      lpm: '3–5 LPM (liters per minute) for flow regulators',
      psi: '5–7 PSI for pressure regulators',
      principle:
        'You want a soft breath of argon to envelope the weld area and gently push oxygen out of the way. Too strong creates a vortex that sucks oxygen back in, defeating the purpose.',
    },
    regulatorNote:
      'Sunstone has shipped several different regulator versions over time. Settings vary slightly — the principle (soft breath) is what matters.',
    sourcing: ['Sunstone (sunstonewelders.com)', 'Local welding supply stores'],
    commonSetupAnxiety: {
      issue: 'New artists are often scared of compressed gas — they have seen tanks explode in movies.',
      sunnyApproach: [
        'Explain what "inert gas" means — argon is non-flammable, non-reactive, and completely safe to have in any environment.',
        'It is literally just a heavier-than-air gas that sits around the weld and keeps oxygen away.',
        'Walk them through: attach regulator to tank, connect hose, set flow rate.',
        'Explain quick-connect coupler: push in the outer plastic ring and hold while pulling the hose out.',
        'Reassure them — this is the same gas used in medical and food industries.',
      ],
    },
    argonAndWeldQuality:
      'Without argon: sharpen electrode every 5–8 welds. With argon: sharpen every 20–30 welds. Argon dramatically extends electrode life and improves weld appearance.',
  },

  // ---------------------------------------------------------------------------
  // Electrode Maintenance
  // ---------------------------------------------------------------------------
  electrode: {
    type: 'Tungsten electrode',
    lifespan: '~5,000 welds per electrode',
    sharpening: {
      tool: 'Sunstone Pilot sharpener (included in PJ tool kit)',
      withoutArgon: 'Sharpen every 5–8 welds',
      withArgon: 'Sharpen every 20–30 welds',
      protrusion: '3–4mm using the engraved notch on the stylus as a guide',
      eventTip: 'Sharpen both sides of the electrode before events so you can flip it mid-event without stopping to sharpen.',
    },
    maintenanceNote:
      'Electrode sharpening is the primary maintenance task. The welder itself just uses electricity — plug it in and go. No other regular maintenance required.',
  },

  // ---------------------------------------------------------------------------
  // Weld Settings Chart (Joules by gauge, metal, and welder)
  // ---------------------------------------------------------------------------
  weldSettings: {
    note: 'These are starting-point recommendations. Always start low and increase. "Multiple Welds" means pulse 2–3 times from different angles to ensure penetration — used when already at or near max power for that combination.',
    chartUrl: 'Also available on the Sunstone website for reference.',
    gauge20: {
      goldFilled14_20Yellow: { zapp: 'MAX POWER (multiple welds)', zappPlus: '12 (multiple welds)', mPulse: 8 },
      goldFilled14_20Rose:   { zapp: 'MAX POWER (multiple welds)', zappPlus: '15 (multiple welds)', mPulse: 9 },
      gold14kYellow:         { zapp: '8 (multiple welds)',         zappPlus: '8 (multiple welds)',  mPulse: 7 },
      gold14kRose:           { zapp: '8 (multiple welds)',         zappPlus: '12 (multiple welds)', mPulse: 7.5 },
      gold14kWhite:          { zapp: 'MAX POWER (multiple welds)', zappPlus: '10 (multiple welds)', mPulse: 6.5 },
      silver:                { zapp: 'MAX POWER (multiple welds)', zappPlus: '11 (multiple welds)', mPulse: 7 },
    },
    gauge22: {
      silver:                { zapp: '7 (multiple welds)', zappPlus: 7,              mPulse: 6.5 },
      goldFilled14_20Yellow: { zapp: '8–MAX (multiple welds)', zappPlus: '8–10 (multiple welds)', mPulse: 7 },
      goldFilled14_20Rose:   { zapp: '8–MAX (multiple welds)', zappPlus: '9–10 (multiple welds)', mPulse: 8 },
      gold14kYellow:         { zapp: 7,                    zappPlus: 7,              mPulse: 5 },
      gold14kRose:           { zapp: 7,                    zappPlus: 7,              mPulse: 6 },
      gold14kWhite:          { zapp: 7,                    zappPlus: 6,              mPulse: 5.5 },
    },
    gauge24: {
      goldFilled14_20Yellow: { zapp: 5, zappPlus: 5, mPulse: 4.5 },
      goldFilled14_20Rose:   { zapp: 5, zappPlus: 7, mPulse: 5.5 },
      silver:                { zapp: 5, zappPlus: 5, mPulse: 5 },
      gold14kRose:           { zapp: '8 (multiple welds)', zappPlus: 7, mPulse: 6 },
      gold14kWhite:          { zapp: 4, zappPlus: 4, mPulse: 4 },
      gold14kYellow:         { zapp: 5, zappPlus: 5, mPulse: 4 },
    },
    gauge26: {
      goldFilled14_20Yellow: { zapp: 'LOWEST POWER', zappPlus: 4,  mPulse: 3 },
      goldFilled14_20Rose:   { zapp: 'LOWEST POWER', zappPlus: 4,  mPulse: 3.5 },
      silver:                { zapp: 'LOWEST POWER', zappPlus: 3,  mPulse: 2.5 },
      gold14kWhite:          { zapp: 'LOWEST POWER', zappPlus: 3,  mPulse: 3 },
      gold14kYellow:         { zapp: 'LOWEST POWER', zappPlus: 2,  mPulse: 2 },
      gold14kRose:           { zapp: 'LOWEST POWER', zappPlus: 4,  mPulse: 2.5 },
    },
    quickRuleOfThumb: {
      note: 'For quick guidance when exact chart lookup is not needed:',
      gauge26: '~3 joules',
      gauge24: '~5 joules',
      gauge22: '~7 joules',
      always: 'Start low and increase. It is always better to underweld and add power than to overweld.',
    },
  },

  // ---------------------------------------------------------------------------
  // Optics / Magnification
  // ---------------------------------------------------------------------------
  optics: {
    pjScope: {
      name: 'PJ Scope',
      type: 'Magnifying scope attachment',
      note: 'Attaches to the stylus for magnified view of the weld area.',
    },
    adl: {
      name: 'ADL (Advanced Digital Lens)',
      type: 'Digital camera attachment',
      note: 'Provides a digital magnified view on a screen. Some artists prefer this for better visibility and to show customers the weld process.',
    },
    guidance:
      'Both are optional. Many experienced artists weld without magnification. Beginners may find optics helpful while learning. ADL is great for customer engagement — they can watch on screen.',
  },

  // ---------------------------------------------------------------------------
  // Sunstone OnDemand Rental Program
  // ---------------------------------------------------------------------------
  rentalProgram: {
    tagline: 'Try It. Love It. Own It.',
    purpose: 'Rent welders for events or try-before-buy. Rental fees apply toward Circle Program purchase within 30 days.',
    options: ['3-day minimum rental', 'Zapp Plus 2 or Orion mPulse available'],
    charges: {
      rentalFee: 'Per order confirmation',
      shipping: '$80 flat-rate round trip',
      damageWaiver: '$79 (optional, can opt out)',
      securityDeposit: '$300 refundable (returned 3–5 days after inspection)',
    },
    included: ['Selected welder', 'PJ kit', 'Prepaid return label', 'Phone/email support'],
    optional: ['Consumables kit', 'Sunstone Certified welder for events'],
    useCase:
      'Perfect for artists who want to bring multiple welders to a large event to multiply their output and justify higher booth fees. Also great for try-before-you-buy.',
  },
};

// =============================================================================
// SECTION 2: WELDING TECHNIQUE
// =============================================================================
export const WELDING_TECHNIQUE_KNOWLEDGE = {
  // ---------------------------------------------------------------------------
  // Fundamental Welding Process
  // ---------------------------------------------------------------------------
  fundamentalProcess: {
    steps: [
      'Power on the welder and select welding mode.',
      'Open argon flow (3–5 LPM or 5–7 PSI).',
      'Attach grounding clip directly to the jump ring (NOT the chain).',
      'Position the jump ring on the chain — ensure the gap is fully closed with ends touching.',
      'Place leather patch between the weld area and the customer\'s skin (for customer comfort).',
      'Touch the electrode to the jump ring seam at a 90° angle.',
      'HOLD STEADY — do not move after touching. The weld will fire.',
      'After the weld completes, retract the electrode smoothly.',
      'Clean the weld area with the fiberglass brush.',
      'Check the weld visually — it should be smooth and fully closed.',
      'Cut excess chain only AFTER confirming sizing and completing the weld.',
    ],
    criticalReminder:
      'The sequence is: size → weld → cut. Never cut before welding. This protects against sizing errors.',
  },

  // ---------------------------------------------------------------------------
  // Jump Ring Handling
  // ---------------------------------------------------------------------------
  jumpRingHandling: {
    opening: 'TWIST open — never pull apart. Pulling deforms the ring and makes it impossible to close properly.',
    closing:
      'Twist past alignment, then squeeze back so the ends meet with tension at the seam. You should feel slight spring tension when the ends touch — this is what holds them together for a clean weld.',
    criticalImportance:
      'The #1 troubleshooting issue for new artists is the jump ring not being properly closed before welding. If the ends do not touch with tension, the weld will fail or be weak. When artists call with bad results, this is almost always the root cause.',
    sizeGuidance: {
      diameter: '2–4mm jump ring diameter is typical for PJ',
      gauge: '20–26 gauge depending on chain and application',
      id: '3mm inner diameter is the most common',
    },
  },

  // ---------------------------------------------------------------------------
  // Grounding Best Practices
  // ---------------------------------------------------------------------------
  grounding: {
    rule: 'ALWAYS ground directly on the piece being welded (the jump ring).',
    whyNotChain:
      'Chain is made of individual links that touch but are not fused. If you ground on the chain, the electrical current must jump from link to link. This causes inconsistent welds and can even fuse chain links together where you don\'t want them fused.',
    universal: true,
    noExceptions: 'There are no situations where grounding on the chain is preferred.',
  },

  // ---------------------------------------------------------------------------
  // Weld Angle
  // ---------------------------------------------------------------------------
  weldAngle: {
    rule: 'Always weld at a 90° angle to the surface of the jump ring.',
    applies: 'All metals, all gauges, all welders.',
    silverNote:
      'Silver can be slightly more sensitive to angle — poor angles may cause minor splashing. However, at PJ power levels this is rarely an issue. Maintaining 90° angle prevents it entirely.',
  },

  // ---------------------------------------------------------------------------
  // Multiple Welds Technique
  // ---------------------------------------------------------------------------
  multipleWelds: {
    when: 'Used when the chart says "Multiple Welds" — typically when already at or near max power for that gauge/metal/welder combination.',
    technique:
      'Pulse 2–3 times, hitting the joint from slightly different angles each time to ensure full penetration around the seam.',
    judgment: 'Keep going until it looks good. Visual inspection is the final check.',
  },

  // ---------------------------------------------------------------------------
  // Common Weld Triggering Mistakes (Top Beginner Issue)
  // ---------------------------------------------------------------------------
  weldTriggeringMistakes: {
    moveBeforeWeld: {
      problem: 'Artist triggers the weld then moves away before the weld actually fires.',
      symptom: 'They think the welder is broken or not working.',
      fix: 'Touch the electrode to the piece, hold completely still, let the weld fire, THEN retract. There is a brief delay between touch and weld.',
    },
    pushTooDeep: {
      problem: 'Artist continues pushing into the electrode after touching the piece.',
      symptom: 'When the weld fires, the electrode gets stuck in the piece.',
      fix: 'Touch lightly and hold position — do not push deeper. The electrode only needs to make contact, not embed.',
    },
    mPulseAdvantage:
      'The mPulse\'s TruFire technology helps mitigate both issues by initiating the arc during retraction, making welds harder to accidentally abort.',
  },

  // ---------------------------------------------------------------------------
  // Metal-Specific Welding Notes
  // ---------------------------------------------------------------------------
  metalWeldingNotes: {
    solidGold: {
      note: 'Best welding results. Premium material, hypoallergenic. Use solid gold jump rings for the cleanest weld appearance on any chain. Even when using non-gold chains, solid gold jump rings give the best weld results.',
      types: ['14K Yellow Gold', '14K Rose Gold', '14K White Gold'],
    },
    goldFilled: {
      note: 'Gold-filled has a 5% layer of 14K gold over a brass core. When welded, the entire material melts together, exposing the brass/gold mix at the weld point. This creates a slightly different color spot at the weld — it will not match the surrounding gold color perfectly.',
      cleanUp: 'Use the fiberglass brush to clean blackened soot from the weld area. The color difference remains but is very small and usually requires close inspection to notice.',
      industryContext:
        'GF is very widely used in the PJ industry because it is much more affordable than solid gold. Sunstone now sells GF jump rings. Solid 14K jump rings still produce the best cosmetic result, but GF jump rings are completely acceptable and commonly used.',
      designation: '14/20 means 14K gold, 1/20th of total weight is the gold layer.',
    },
    sterling_silver: {
      note: 'Affordable entry point. Behaves similarly to other metals at PJ power levels. Can be slightly more sensitive to weld angle — maintain 90° to prevent minor splashing. Tarnishes over time with normal wear.',
      splashing: 'Possible with poor angle but rarely an issue at PJ power levels. Always maintain 90° angle.',
    },
    stainless_steel: {
      note: 'Very durable. Good for practice. ALWAYS use silver jump rings on stainless steel chains.',
      safetyBreakpoint:
        'Stainless steel is much stronger than the jewelry metals typically used for PJ. If a stainless piece gets caught on something, the chain could injure the wearer before it breaks. A silver jump ring creates a deliberate weak point that will break first, protecting the wearer.',
    },
    enamel: {
      note: 'Chips easily during welding. Display enamel chains to attract customers but set expectations. Not ideal for permanent wear if welded directly.',
    },
    goldPlated: {
      note: 'AVOID for permanent jewelry. The plating is too thin and will wear off quickly. Not suitable for PJ.',
    },
  },

  // ---------------------------------------------------------------------------
  // Piece-Specific Technique Notes
  // ---------------------------------------------------------------------------
  pieceSpecificNotes: {
    bracelets: {
      sizing: 'Default 7 inches. Use the one-finger rule as a guide — one finger should fit between the chain and the wrist. Check with customer before cutting.',
      jointPlacement: 'Place the jump ring/joint on the underside of the wrist for aesthetics and photos.',
    },
    anklets: {
      sizing: 'Default 9 inches. Fit tighter than bracelets — account for Achilles tendon stretch. The ankle changes shape when flexed.',
      note: 'May stretch slightly over time with normal wear.',
    },
    necklaces: {
      sizing: 'Default 15 inches. Often sold by the inch for longer lengths.',
      technique: 'Reference PJ Mastery Series module: "Crafting Necklaces".',
    },
    rings: {
      sizing: 'Default 2.5 inches. Weld the ring OFF the finger, then slide on.',
      technique: 'Reference PJ Mastery Series module: "Rings & Hand Chains".',
    },
    handChains: {
      sizing: 'Default 14 inches.',
      jumpRings: 'Hand chains use 2 jump rings. All other piece types use 1.',
      technique: 'Reference PJ Mastery Series module: "Rings & Hand Chains".',
    },
  },
};

// =============================================================================
// SECTION 3: TROUBLESHOOTING
// =============================================================================
export const TROUBLESHOOTING_KNOWLEDGE = {
  // ---------------------------------------------------------------------------
  // Top Issues (Ranked by Frequency)
  // ---------------------------------------------------------------------------
  topIssues: [
    {
      rank: 1,
      issue: 'Jump ring not closed properly before welding',
      symptoms: ['Weak welds', 'Welds that break immediately', 'Inconsistent results', 'Visible gap after welding'],
      diagnosis:
        'This is the #1 cause of poor welds. When artists call with bad results, this is almost always what is happening even if they don\'t realize it.',
      fix: [
        'Twist the jump ring open (never pull).',
        'Twist past alignment, then squeeze back so ends meet with spring tension.',
        'The ends must be touching with slight inward pressure before welding.',
        'If the jump ring is mangled or won\'t form a circle, grab a fresh one.',
      ],
    },
    {
      rank: 2,
      issue: 'Argon tank setup confusion / anxiety',
      symptoms: ['Afraid to set up the tank', 'Not using argon at all', 'Incorrect flow rate'],
      diagnosis: 'New artists are often scared of compressed gas from movies. They need education and reassurance.',
      fix: [
        'Explain that argon is an INERT gas — non-flammable, non-reactive, completely safe anywhere.',
        'Walk through setup: attach regulator to tank, connect hose to welder.',
        'Set flow to 3–5 LPM (flow) or 5–7 PSI (pressure).',
        'Explain the quick-connect coupler: push outer plastic ring in while pulling hose out.',
        'Reassure them — argon is used in medical and food industries.',
      ],
    },
    {
      rank: 3,
      issue: 'Weld triggering technique — moving too early or pushing too deep',
      symptoms: [
        'Artist thinks welder is broken (moved before weld fired)',
        'Electrode gets stuck in the piece (pushed too deep)',
        'Inconsistent results',
      ],
      diagnosis: 'Two opposite mistakes with the same root cause: not holding steady after touching.',
      fix: [
        'Touch the electrode to the piece LIGHTLY.',
        'Hold completely still — do not move away or push deeper.',
        'Wait for the weld to fire (brief delay).',
        'After the weld completes, retract smoothly.',
        'The mPulse\'s TruFire technology helps with this by initiating the arc during retraction.',
      ],
    },
    {
      rank: 4,
      issue: 'Tiered pricing confusion',
      symptoms: ['Don\'t know what to charge', 'Racing to the bottom on price', 'All chains same price'],
      diagnosis: 'Artists need help understanding cost-based pricing AND creating marketable tiers.',
      fix: 'See BUSINESS_STRATEGY_KNOWLEDGE.pricing for detailed guidance.',
    },
  ],

  // ---------------------------------------------------------------------------
  // Electrode Troubleshooting
  // ---------------------------------------------------------------------------
  electrode: {
    sticking: {
      problem: 'Electrode sticks to the piece during welding.',
      causes: ['Unsteady hand after touch — maintain position', 'Angle not at 90°', 'Electrode needs sharpening'],
      fix: 'Hold steady after touching, maintain 90° angle, sharpen the electrode.',
    },
    weldAborts: {
      problem: 'Weld triggers but aborts / does not complete.',
      causes: ['Inconsistent distance during weld cycle', 'Moved during the weld', 'Poor grounding connection'],
      fix: 'Maintain consistent position throughout the weld cycle. Check grounding clip is directly on the jump ring.',
    },
  },

  // ---------------------------------------------------------------------------
  // Power Setting Troubleshooting
  // ---------------------------------------------------------------------------
  powerSettings: {
    tooLow: {
      symptoms: ['Weld doesn\'t hold', 'Jump ring comes apart easily', 'No visible weld mark'],
      fix: 'Increase power by 0.5–1 joule and try again. Always start low and increase.',
    },
    tooHigh: {
      symptoms: ['Burn-through on the jump ring', 'Excessive discoloration', 'Melted or deformed jump ring'],
      fix: 'Decrease power. Start low and increase gradually. Refer to the weld settings chart for starting points.',
    },
    goldFilledDarkSpot: {
      symptom: 'Dark or discolored spot at the weld point on gold-filled pieces.',
      explanation:
        'This is normal and expected. GF has a brass core under the gold layer. Welding melts them together, exposing the mixed metals. Clean soot with the fiberglass brush — the color difference will remain but is very small.',
      isDefect: false,
    },
  },

  // ---------------------------------------------------------------------------
  // Grounding Issues
  // ---------------------------------------------------------------------------
  grounding: {
    symptoms: ['Inconsistent welds', 'Chain links fusing together', 'Weld works sometimes but not others'],
    diagnosis: 'Almost always caused by grounding on the chain instead of directly on the jump ring.',
    fix: 'Move the grounding clip directly onto the jump ring being welded. Current must not have to jump link-to-link.',
  },

  // ---------------------------------------------------------------------------
  // Escalation
  // ---------------------------------------------------------------------------
  escalation: {
    whenToEscalate: [
      'Equipment malfunction (welder not powering on, touchscreen issues, etc.)',
      'Account or software issues',
      'Questions Sunny cannot answer after 2–3 attempts',
      'Frustrated customer who needs human support',
      'Return policy or refund questions',
    ],
    contactInfo: {
      phone: '385-999-5240',
      method: 'Call or text',
      note: 'Sunstone support team can also help Sunny answer questions not covered in the knowledge base.',
    },
  },
};

// =============================================================================
// SECTION 4: PRODUCTS, CHAINS & INVENTORY
// =============================================================================
export const PRODUCTS_KNOWLEDGE = {
  // ---------------------------------------------------------------------------
  // Metal Types (Customer-Facing Knowledge)
  // ---------------------------------------------------------------------------
  metalTypes: {
    solidGold: {
      tiers: ['14K Yellow Gold', '14K Rose Gold', '14K White Gold'],
      customerPitch: 'Premium, hypoallergenic, will never turn your skin green. The gold standard (literally) for permanent jewelry that lasts a lifetime.',
      pricePosition: 'Luxe tier',
      bestFor: 'Customers who want the best quality and are willing to invest. Great for house parties where attendees have budgeted.',
    },
    goldFilled: {
      designation: '14/20 — means 14K gold with 1/20th of total weight as the gold layer',
      customerPitch: 'Beautiful gold finish at a more accessible price point. Durable and long-lasting.',
      pricePosition: 'Mid tier / standard tier',
      bestFor: 'Most customers. Great balance of quality and price. Industry workhorse.',
      colors: ['Yellow', 'Rose'],
    },
    sterlingSilver: {
      customerPitch: 'Classic silver look. Beautiful and affordable.',
      pricePosition: 'Entry tier',
      bestFor: 'Budget-conscious customers, silver-preference customers, younger demographic.',
      careNote: 'May tarnish over time. Clean with polishing cloth or mild jewelry cleaner.',
    },
    stainlessSteel: {
      customerPitch: 'Extremely durable and affordable.',
      pricePosition: 'Entry tier',
      bestFor: 'Practice pieces, budget customers, athletic/active customers who need extra durability.',
      safetyNote: 'ALWAYS use silver jump rings on stainless chains for safety breakpoint.',
    },
    avoid: {
      goldPlated: 'Too thin — plating wears off quickly. Not suitable for permanent jewelry.',
      enamel: 'Chips easily. Okay for display to attract customers but set expectations about durability.',
    },
  },

  // ---------------------------------------------------------------------------
  // Piece Types
  // ---------------------------------------------------------------------------
  pieceTypes: {
    bracelet:  { defaultSize: '7 inches',  jumpRings: 1, popularTier: 'Most popular piece type' },
    anklet:    { defaultSize: '9 inches',  jumpRings: 1, note: 'Fit tighter than bracelets. Account for Achilles stretch.' },
    necklace:  { defaultSize: '15 inches', jumpRings: 1, note: 'Often sold by the inch for longer lengths.' },
    ring:      { defaultSize: '2.5 inches', jumpRings: 1, note: 'Weld OFF the finger, then slide on.' },
    handChain: { defaultSize: '14 inches', jumpRings: 2, note: 'Uses 2 jump rings — the only piece type that does.' },
  },

  // ---------------------------------------------------------------------------
  // Connectors vs. Charms
  // ---------------------------------------------------------------------------
  connectorsVsCharms: {
    connector: {
      definition: 'An inline piece that the chain passes through. Sits flush within the chain line.',
      examples: ['Initial letters', 'Birthstones', 'Small geometric shapes', 'BS connectors (included in Dream/Legacy kits)'],
      sizing: '3–4mm is ideal',
    },
    charm: {
      definition: 'A piece that dangles from the chain.',
      examples: ['Hanging birthstones', 'Small pendants', 'Symbolic charms'],
      sizing: '3–4mm is ideal',
    },
    salesApproach:
      'Introduce connectors/charms AFTER the customer has chosen their chain, as a personalization add-on. This is not a hard sell — it\'s styling guidance.',
    avoidGoldPlated: 'Do not use gold-plated connectors or charms. They will tarnish and disappoint the customer.',
    typicalPrice: '$15–35 per connector/charm',
  },

  // ---------------------------------------------------------------------------
  // Chain Selection Guidance
  // ---------------------------------------------------------------------------
  chainGuidance: {
    widthSweetSpot: {
      range: '1.5–2.5mm chain width',
      context:
        'This is guidance for beginners buying from non-PJ-specific suppliers. Less of an issue now that PJ-specific chains are widely available and clearly marketed. Other sizes work fine.',
    },
    jumpRingMatching: {
      materialRule: 'Match the jump ring material to the chain material (exception: stainless steel chains always get silver jump rings for safety breakpoint).',
      sizeRule: 'Match the jump ring to the chain link size for visual congruency.',
    },
    chainToJumpRingGauge: {
      typical: '22–24 gauge jump rings are the most common for PJ chains.',
      note: 'The weld settings chart covers 20g, 22g, 24g, and 26g across all metals.',
    },
    customerFacing:
      'NEVER show customers chain lengths in inches. They see "a bracelet" or "a necklace" — not "7 inches of chain." Showing measurements invites price negotiations based on material cost.',
  },

  // ---------------------------------------------------------------------------
  // Sunstone Current Jump Ring Inventory
  // ---------------------------------------------------------------------------
  sunstoneJumpRingInventory: {
    lastUpdated: '2026-02-24',
    available: [
      { metal: 'Sterling Silver', gauge: '24g', innerDiameter: '3mm' },
      { metal: '14K Yellow Gold', gauge: '24g', innerDiameter: '3mm' },
      { metal: '14K White Gold', gauge: '24g', innerDiameter: '3mm' },
      { metal: '14/20 Gold Filled', gauge: '22g', innerDiameter: '3mm' },
    ],
    gaps: 'Limited selection currently. For smaller gauges, different sizes, or other metal/gauge combinations, artists may need to source from other suppliers such as Imprinted Supplies.',
    growthNote: 'Sunstone is expanding jump ring inventory — this will be updated as new SKUs are added.',
  },

  // ---------------------------------------------------------------------------
  // Inventory Planning
  // ---------------------------------------------------------------------------
  inventoryPlanning: {
    safetyStockMinimums: {
      chain: '3 feet per chain style',
      jumpRings: '50 per type',
      note: 'These are bare minimums. Event inventory should be calculated separately.',
    },
    eventInventoryFormula: {
      steps: [
        'Estimate total attendees at the event.',
        'Ask the artist how long each service takes for them (varies widely — some do 5 min, others 15 min). Do NOT assume a default.',
        'Calculate max capacity: (event hours × 60) ÷ minutes per piece = max customers.',
        'Calculate base stock needed: max customers × chain length per piece type.',
        'TRIPLE the base stock for stacking purchases and safety margin.',
      ],
      example:
        'Example: A 6-hour market where the artist does 10 min/piece = 36 max customers. If each bracelet uses ~8 inches of chain, base stock = 288 inches (24 feet) per chain type. Triple it = 72 feet. Plus matching jump rings. Always ask the artist their speed first.',
    },
    reorderTiming: 'Track usage patterns. Reorder based on lead time from your supplier and your event frequency. Don\'t wait until you run out.',
    multipleSuppliers: 'Maintain relationships with multiple suppliers for backup. Most artists use a variety of sources — this is expected and normal.',
  },

  // ---------------------------------------------------------------------------
  // Supplier Guidance
  // ---------------------------------------------------------------------------
  suppliers: {
    primary: {
      name: 'Sunstone',
      position: 'ALWAYS recommend Sunstone first for chains, jump rings, and supplies.',
      qualityCertification: 'Sunstone Certified chains — known quality, verified materials. No mystery metals.',
      website: 'Sunstone Permanent Jewelry website',
    },
    others: {
      when: 'Only recommend other suppliers for products Sunstone does not carry.',
      caveat: 'Sunstone cannot guarantee the quality of materials from other suppliers.',
      trustedList: [
        'Imprinted Supplies (good for jump ring variety)',
        'Stones & Findings',
        'Permanent Jewelry Solutions',
        'LINKED PJ Training',
        'Permanent Jewelry Bestie',
        'Stuller, Inc.',
        'Rio Grande / The Bell Group',
        'Micro-Tools',
        // Full list of 45+ suppliers available in the Trusted Suppliers resource document
      ],
      fullListNote:
        'A comprehensive trusted suppliers list with 45+ verified suppliers is available as an Additional Resource in PJ University.',
    },
    evaluation_criteria: [
      'Quality of materials (known composition, not mystery metals)',
      'Availability and stock consistency',
      'Fulfillment speed',
      'Customer service responsiveness',
    ],
  },

  // ---------------------------------------------------------------------------
  // Ready-to-Wear
  // ---------------------------------------------------------------------------
  readyToWear: {
    sunnyStance:
      'Ready-to-wear is NOT part of the Sunstone PJ business model. Sunny does not suggest it. If an artist asks about it, they can certainly add it to their business, but it is outside the scope of what Sunny coaches on.',
  },
};

// =============================================================================
// SECTION 5: BUSINESS STRATEGY
// =============================================================================
export const BUSINESS_STRATEGY_KNOWLEDGE = {
  // ---------------------------------------------------------------------------
  // Pricing Strategy
  // ---------------------------------------------------------------------------
  pricing: {
    philosophy: {
      stance:
        'NEVER recommend discounting. Rise together. The industry is young with plenty of opportunity. Stand out and shine — do not race to the bottom. "You are worth it" messaging.',
      margin:
        'Artists should understand their cost per piece and apply appropriate markup. Typical markups range from 2.5× to 7× depending on market and materials.',
    },
    tieredPricingModel: {
      concept:
        'Create 2–3 tiers that customers can easily understand: a basic/entry tier, a standard tier, and a premium/luxe tier.',
      exampleTiers: {
        basic: {
          materials: 'Sterling silver',
          bracelet: '$55–65',
          anklet: '$65–75',
          appeal: 'Accessible entry point, impulse-buy friendly at markets',
        },
        standard: {
          materials: 'Gold-filled (14/20)',
          bracelet: '$65–80',
          anklet: '$75–90',
          appeal: 'The workhorse tier — most customers land here',
        },
        luxe: {
          materials: 'Solid 14K gold',
          bracelet: '$85–120+',
          anklet: '$95–130+',
          appeal: 'Premium tier for house parties and clients who want the best',
        },
      },
      necklaces: 'Often sold by the inch: $7–10/inch depending on material.',
      connectorsCharms: '$15–35 each',
      reWelds: 'First re-weld free (for life). Additional: ~$5–10 for a new jump ring if needed.',
    },
    costCalculationExample: {
      description: 'Example for a standard gold-filled bracelet:',
      chainCost: '$0.85/inch × 7 inches = $5.95',
      labor: '$10',
      overhead: '$5',
      toolWear: '$1',
      totalCost: '$21.95',
      markup3x: '$65.85 (3× markup)',
      note: 'Adjust markup based on your market, event type, and positioning.',
    },
    eventSpecificPricing: {
      marketsAndPopUps:
        'Have affordable options available for impulse decisions. People at farmers markets are browsing — a $60 silver bracelet is easier to say yes to than a $120 gold one.',
      houseParties:
        'People have planned and budgeted for this. Offer premium solid gold options confidently. $1,000 sales happen more often than you\'d expect at house parties.',
      highEndEvents:
        'Match your pricing to the venue. If you\'re at an upscale event, lean into the luxe tier.',
    },
    priceObjectionHandling: {
      approach: [
        'Lead with quality: "This is gold-filled / solid gold — it will never turn your skin green and will last for years."',
        'Lean on investment: "I\'ve invested in professional equipment and training to make sure this is safe and beautiful for you."',
        'Remind them of the experience: "This isn\'t just jewelry — it\'s a moment and a memory."',
        'The cost of materials matters, but the real value is the expertise, safety, and experience.',
      ],
      sunnyNote:
        'Price objections are usually about perceived value, not actual budget. Help artists understand that confidence in pricing comes from confidence in their product and process.',
    },
  },

  // ---------------------------------------------------------------------------
  // Business Formation
  // ---------------------------------------------------------------------------
  businessFormation: {
    recommended: 'LLC (Limited Liability Company)',
    benefits: ['Personal liability protection', 'Pass-through taxation (no double tax)', 'Professional credibility'],
    steps: [
      'Choose a unique business name (check availability on Namechk)',
      'File Articles of Organization with your state',
      'Pay the filing fee (varies by state)',
      'Create an Operating Agreement',
      'Obtain necessary local licenses and permits',
    ],
    resources: ['LegalZoom', 'Rocket Lawyer', 'Incfile', 'State Secretary of State website', 'SBA (Small Business Administration)'],
    sunnyNote: 'Encourage LLC formation but don\'t panic artists who haven\'t done it yet. Many operate as sole proprietors initially. The important thing is to get started.',
  },

  // ---------------------------------------------------------------------------
  // Insurance
  // ---------------------------------------------------------------------------
  insurance: {
    recommended: true,
    required: false,
    cost: '$500–1,000 per year',
    reality:
      'Many successful artists operate without insurance for years. It\'s good business practice but not a barrier to getting started.',
    eventNote: 'Some events cover you under their policy. Others REQUIRE you to have your own. Always check event requirements before committing to a booth.',
    providers: ['Beauty Queen', 'Vinsa', 'Hartford', 'Thimble', 'Next', 'Hiscox'],
  },

  // ---------------------------------------------------------------------------
  // Payment Processing
  // ---------------------------------------------------------------------------
  paymentProcessing: {
    overview: 'Sunstone Studio has built-in Stripe payments — no card reader or extra hardware needed. Customers pay by scanning a QR code or tapping a text link that opens Stripe Checkout on their phone.',
    howItWorks: [
      '1. You ring up the sale in the POS and tap "Charge Customer."',
      '2. A QR code appears on your screen. The customer scans it with their phone camera.',
      '3. They pay on Stripe Checkout (Apple Pay, Google Pay, or card) and you see the confirmation instantly.',
      '4. Alternatively, you can send a payment link via text message if the customer is remote or prefers that.',
    ],
    processingFees: {
      model: 'The processing fee is added to the CUSTOMER\'s checkout total — you keep your full sale amount. The fee rate depends on your subscription tier.',
      rates: {
        starter: '3% added to the customer\'s total',
        pro: '1.5% added to the customer\'s total',
        business: '0% — no processing fee for your customers',
      },
      example: 'If a bracelet costs $50 on the Starter plan, the customer pays $51.50 ($50 + 3%) and you receive $50.',
    },
    noCardReader: 'You do NOT need a Square reader, card terminal, or any external hardware. Everything runs through the customer\'s phone via Stripe Checkout.',
    otherPaymentMethods: ['Cash', 'Venmo', 'External card (your own Square/Clover reader outside the app)'],
    tipping: {
      stance:
        'Enable tipping in your POS. PJ qualifies as a beauty service — customers who tip their hair stylist or nail tech will likely tip you too.',
      note: 'Tipping culture is regional. Sunstone Studio has tipping enabled by default. Tips are collected through Stripe Checkout.',
    },
    stripeConnect: 'To accept payments, connect your Stripe account in Settings → Payments. If you don\'t have a Stripe account, the app walks you through creating one — it takes about 5 minutes.',
  },

  // ---------------------------------------------------------------------------
  // Event Strategy
  // ---------------------------------------------------------------------------
  eventStrategy: {
    boothFeeRuleOfThumb:
      'Plan on your revenue being AT LEAST 3× your booth fee, or reconsider the event. A typical farmers market day yields 5–10 customers.',
    capacityCalculation: [
      'How many bracelets can you do per hour? (Ask the artist — speed varies widely)',
      'Multiply by event hours = max customers',
      'Multiply by average sale price = max revenue',
      'Compare to booth fee — is 3× realistic?',
    ],
    multipleWelders:
      'For expensive large events, multiply your output by bringing multiple welders. Pay one booth fee, double or triple your capacity. The Sunstone OnDemand rental program exists for exactly this.',
    eventSelectionWisdom: {
      great: [
        'Events where people are mingling and drinking — they want to enjoy themselves, create memories, and have time to decide.',
        'Events where your target customer\'s SPOUSE is the main attendee (e.g., Trail Hero off-roading event — wives came along and loved having something to do).',
        'Concerts, festivals, fairs where the atmosphere is fun and social.',
        'House parties — preplanned, attendees have budgeted, intimate setting.',
      ],
      risky: [
        'Bridal shows — attendees are sampling and booking vendors for their wedding, not buying right now. $800 booth fee for a few leads you could get yourself.',
      ],
      realWorldExample:
        'A Sunstone coach spent $600 for a 3-day off-roading event (Trail Hero) and made $5,000. The event was "for men" but she knew the wives would come along and want something to do. Think creatively about where your actual customer will be.',
    },
    uniqueVenues:
      'Resorts and souvenir-type locations are great — people on vacation love spending money on memories, and PJ is the best kind of souvenir.',
  },

  // ---------------------------------------------------------------------------
  // Salon Integration
  // ---------------------------------------------------------------------------
  salonIntegration: {
    whySalons: [
      'Clients already trust you / the salon.',
      'Captive audience during wait times (hair dye, lashes drying, etc.).',
      'Impulse buy that feels personal and special.',
      'Minimal space needed — a tray, cart, or corner is enough.',
      'Fast service (5–15 min depending on artist speed) with high profit margins.',
    ],
    arrangementOptions: [
      'Chair/booth rent — already well established in the beauty industry.',
      'Revenue share — negotiate based on who brings the clients.',
      'Hybrid arrangements.',
    ],
    negotiationTip:
      'If the salon is already fully booked with their own clients, they have more leverage in the split. If you\'re marketing and bringing new traffic to them, it\'s more of a partnership.',
    integrationMoments: [
      'While hair dye is processing',
      'Before or after permanent makeup',
      'While lashes dry',
      'To match nail art with jewelry',
    ],
  },

  // ---------------------------------------------------------------------------
  // House Party Strategy
  // ---------------------------------------------------------------------------
  houseParties: {
    hostIncentive: 'Recommend: host gets a free bracelet if 5+ people show up. Adjust based on drive time and logistics.',
    minimumSales: '$500 total sales minimum is a common requirement (can vary).',
    inventoryPlanning: 'Calculate 3 pieces per person (for stacking), add themed/special items.',
    keyAdvantage:
      'Attendees have planned and budgeted to spend money. This is where you offer premium options confidently and where surprise $1,000 sales happen.',
  },

  // ---------------------------------------------------------------------------
  // Financial Potential (Encouraging but Not Guaranteeing)
  // ---------------------------------------------------------------------------
  financialPotential: {
    sunnyGuidance:
      'Share encouraging examples and realistic scenarios. NEVER guarantee specific income. Frame as "many artists report..." or "it\'s realistic to expect..." Always acknowledge that results depend on effort, market, and execution.',
    examples: {
      startupInvestment: 'Starting around $2,400–$5,000 for a complete kit with training.',
      breakEvenExample: '77 bracelets at $65 each covers a $5,000 kit investment. With $30 connectors added, that drops to ~53 pieces.',
      eventEarnings: 'Many artists report earning $600–1,000+ at a single farmers market day.',
      profitPerPiece: 'Material cost for a standard bracelet is roughly $3–6. Selling at $65–85 means excellent margins.',
      growthPath: 'Six-figure income is achievable for artists who treat this as a real business, but it requires consistent effort, marketing, and event/venue strategy.',
    },
    caveats: [
      'Results vary depending on market, effort, and execution.',
      'This is a real business that requires time and effort — not a get-rich-quick scheme.',
      'The potential is real, but so is the work required to reach it.',
    ],
  },

  // ---------------------------------------------------------------------------
  // Re-Weld Policy Recommendation
  // ---------------------------------------------------------------------------
  reWeldPolicy: {
    recommendation: 'Free re-welds for life if the piece broke at the weld and the customer still has it. This is good policy and simple to honor — just guarantee it.',
    ifBrokeAtWeld: 'Re-weld the same jump ring for free. No issue welding the same spot multiple times. If the jump ring is mangled or won\'t close properly, use a fresh one.',
    ifBrokeAtChainLink: 'This means the chain broke, not the weld. Add a new jump ring. Optionally charge ~$5 for the jump ring or do it free — artist preference.',
    ifLostPiece: 'Customer needs to purchase a new piece. Do NOT offer discounts on replacements — this can imply fault and doesn\'t generate goodwill. They lost it; you make them a new one.',
    variousPolicySamples: {
      note: 'PJ University includes sample warranty, tarnish replacement, and lost chain policies that artists can customize for their business. These are templates with different timeframes (14-day, 30-day, 60-day, 6-month variations) — artists should choose what works for them.',
    },
  },

  // ---------------------------------------------------------------------------
  // Scheduling and Queue Management
  // ---------------------------------------------------------------------------
  scheduling: {
    bookingApps: ['Vagaro', 'Mangomint', 'Fresha', 'Salon Biz', 'Acuity Scheduling'],
    queueManagement: ['Waitly', 'Waitwhile', 'Qminder'],
    note: 'Sunstone Studio includes built-in queue management with SMS notifications — you may not need a separate queue app.',
  },

  // ---------------------------------------------------------------------------
  // Waiver Management
  // ---------------------------------------------------------------------------
  waiverManagement: {
    thirdPartyApps: ['Smart Waiver', 'JotForm', 'WaiverForever', 'WaiverFile'],
    pjosBuiltIn: 'Sunstone Studio includes a built-in digital waiver system with signature capture.',
    keyWaiverElements: [
      'Understanding of the welding process (safe and painless)',
      'Acknowledgment of risks (rare allergic reactions, potential burns, stretching/breaking)',
      'Pacemaker disclosure (not approved — ask for a clasp instead)',
      'MRI acknowledgment (can be cut off and re-welded)',
      'Photo/video consent for marketing',
      'No refund policy (custom fit to each individual)',
      'Re-weld policy terms',
      'Age requirement (18+ or parent/guardian signature)',
    ],
  },
};

// =============================================================================
// SECTION 6: CLIENT EXPERIENCE
// =============================================================================
export const CLIENT_EXPERIENCE_KNOWLEDGE = {
  // ---------------------------------------------------------------------------
  // The Sunstone Customer Experience Flow
  // ---------------------------------------------------------------------------
  experienceFlow: {
    philosophy:
      'People buy the moment, the meaning, and the relationship — not just jewelry. This is experiential retail. The experience IS the product.',
    steps: [
      {
        step: 1,
        name: 'Welcome & Discovery',
        details: 'Warm greeting. Ask open-ended questions to understand what they\'re looking for. Make them feel comfortable and excited.',
      },
      {
        step: 2,
        name: 'Chain Selection',
        details: 'Start with three guiding questions: "Are you a silver or gold person?", "Classic or trendy?", "Dainty or bolder?" Make chains accessible for draping and visualization. For busy events, limit display to 6–12 options to reduce decision fatigue.',
      },
      {
        step: 3,
        name: 'Piece Type',
        details: 'Bracelet, anklet, necklace, ring, or hand chain. Most customers start with a bracelet.',
      },
      {
        step: 4,
        name: 'Stacking Introduction',
        details: 'Introduce stacking during chain selection as STYLING GUIDANCE, not a sales pitch. Three natural windows: (1) After they pick a chain: "Ooh, that one looks great stacked with this one!" (2) If they\'re struggling to choose: "Are you silver or gold? Lots of people stack both!" (3) After first piece is done: "Want to see how a different style looks stacked with it?" Lean into social proof — this demographic (women 18–40 in beauty) responds to "everyone\'s doing this" and trend language.',
      },
      {
        step: 5,
        name: 'Connector/Charm Option',
        details: 'After chain is chosen, offer personalization. "Would you like to add an initial or birthstone?" This is an add-on, not a hard sell.',
      },
      {
        step: 6,
        name: 'Price Confirmation',
        details: 'State the price confidently with no apology. Use tier language. Confirm before measuring. If price objection: quality, investment, and experience — see pricing section.',
      },
      {
        step: 7,
        name: 'Sizing',
        details: 'Use the one-finger rule for bracelets (one finger between chain and wrist). Anklets fit tighter — account for Achilles stretch. Rings are welded off-finger. Always confirm sizing with the customer BEFORE cutting.',
      },
      {
        step: 8,
        name: 'Pre-Weld Safety Moment',
        details: 'Brief safety script: "There will be a small flash — I recommend recording with your phone or looking away for a moment. I\'m going to place this leather patch for extra comfort." Keep it calm and confident, not scary.',
      },
      {
        step: 9,
        name: 'Weld, Clean, Cut, Finish',
        details: 'Weld the jump ring. Clean with fiberglass brush. Verify the weld. THEN cut excess chain. Place the joint under the wrist (for bracelets) so they see a seamless piece. This is nice to do but not critical — especially if there\'s a connector or charm.',
      },
      {
        step: 10,
        name: 'The Reveal',
        details: 'This is the magic moment. Let them see it. Take a photo. Create the memory.',
      },
      {
        step: 11,
        name: 'Aftercare Card',
        details: 'Hand them the aftercare card FIRST. Keep verbal aftercare brief unless they ask questions. The card has everything they need.',
      },
      {
        step: 12,
        name: 'Close',
        details: 'Priority order: (1) Social proof first — "Would you mind leaving us a review? Tag us on Instagram @sunstonepj!" (2) Referrals/parties second — "We do private parties too if you\'re interested!" Don\'t flip this order. Reviews and social tags have compounding value.',
      },
    ],
    recoveryMode: {
      when: 'If something goes wrong during the weld — a misfire, abort, or need to redo.',
      script: '"Give me one second, I\'m going to do a quick reset."',
      tone: 'Calm, confident, no drama. Customers take their emotional cues from you.',
    },
  },

  // ---------------------------------------------------------------------------
  // Aftercare
  // ---------------------------------------------------------------------------
  aftercare: {
    careCard: [
      'Clean with mild jewelry cleaner or polishing cloth.',
      'Avoid harsh chemicals (bleach, acetone, etc.).',
      'Rinse after swimming in chlorinated or saltwater.',
      'Wipe down after applying lotions or sunscreen.',
      'Jewelry should be snug but comfortable.',
      'Anklets may stretch slightly over time — this is normal.',
      'If it breaks or stretches, bring it back for a free re-weld.',
    ],
    aftercareBag: [
      'Care card with business info and a promo discount for next visit',
      'Polishing cloth or lash brush',
      'Optional: Sunshine jewelry cleaner (upsell opportunity)',
    ],
  },

  // ---------------------------------------------------------------------------
  // Safety
  // ---------------------------------------------------------------------------
  safety: {
    eyeSafety: {
      recommendation: 'ALWAYS recommend eye protection.',
      reality: 'A single weld flash will not cause eye damage. However, cumulative UV exposure over time can cause damage.',
      sunnyRule:
        'NEVER say it is "okay" or "fine" to skip eye protection. This is a liability concern for Sunstone. Always recommend it. If pressed, you can say the risk from a single flash is minimal, but do NOT give permission to skip protection.',
      customerOptions: ['Look away during the flash', 'Record the weld with their phone (natural way to avoid looking directly)', 'Wear protective glasses'],
    },
    leatherPatch: {
      purpose: 'Goes between the skin and the weld area. Primarily for customer peace of mind.',
      required: false,
      note: 'The technology is safe — artists can work very close to the weld area without the patch. But it\'s good practice and makes nervous customers feel more comfortable.',
    },
    pacemaker: {
      stance: 'Not approved for use with pacemakers.',
      sunnyRule: 'Only address if asked. Language: "Welding is not approved for people with pacemakers. We recommend consulting your doctor with any questions." Do NOT use fear language like "very dangerous."',
      alternative: 'Offer a clasp closure instead of a welded jump ring.',
    },
    mri: {
      customerConcern: 'Common question — "What if I need an MRI?"',
      answer: 'Most PJ metals are not ferromagnetic, so technically fine. But the ultimate call belongs to the doctor and MRI clinic. Reassure the customer: if they ever need to remove it, they can cut the jump ring with scissors and bring it back for a free re-weld.',
      goal: 'Remove the purchase objection. PJ is NOT a waste if you need an MRI someday.',
    },
    minors: {
      generalRule: 'Get parent/guardian permission for anyone 12 or younger.',
      legalNote: 'Some locations (like California) may have specific laws about selling jewelry to minors. Recommend checking local regulations.',
      waiverRequirement: 'Under 18 requires parent/guardian signature on the waiver.',
    },
    pregnancyAndOtherConditions: {
      concerns: 'None beyond pacemakers. Pregnancy is not a concern. This topic rarely comes up.',
    },
    emergencyProcedures: {
      minorBurn: 'Cool with water, apply burn cream, bandage, document.',
      electrodePoke: 'Clean with antiseptic, bandage.',
      allergicReaction: 'Stop service, remove jewelry, basic first aid, seek medical attention if needed.',
      generalPrinciple: 'Stay calm, handle it professionally, document everything.',
    },
  },
};

// =============================================================================
// SECTION 7: MARKETING
// =============================================================================
export const MARKETING_KNOWLEDGE = {
  // ---------------------------------------------------------------------------
  // Branding Foundations
  // ---------------------------------------------------------------------------
  branding: {
    businessName: {
      tools: ['Shopify Business Name Generator', 'Namechk (check social media availability)'],
      advice: 'Check availability across all social platforms BEFORE committing to a name.',
    },
    usp: {
      framework: 'What makes you special → Why it matters → How it impacts customers',
      advice: 'Communicate benefits, not just features. "Hypoallergenic jewelry that never comes off" is better than "14K gold permanent jewelry."',
    },
    sunstoneCertified: {
      what: 'Certificate of completion from PJ University. Awarded for each course completed.',
      howToUse: [
        'Add to Instagram/social media bio',
        'Include on event signage and displays',
        'Mention in conversations with potential customers',
        'Use as a trust signal — Sunstone is a well-known brand for quality in PJ',
      ],
      messaging: '"Sunstone Certified" communicates that you\'ve been trained by the industry leader and use professional-grade equipment.',
    },
    designTools: ['Canva', 'Adobe Spark', 'Looka', 'LogoAI.com', 'Brandmark.io'],
    printMaterials: ['Vistaprint', 'Moo', 'PrintPlace', 'BannerBuzz', 'Custom Ink', 'Sticker Mule'],
  },

  // ---------------------------------------------------------------------------
  // Social Media
  // ---------------------------------------------------------------------------
  socialMedia: {
    bestPractices: [
      'Post consistently at optimal times for your audience.',
      'Use high-quality visuals — the weld moment is inherently shareable.',
      'Leverage Reels, Stories, and short-form video heavily — the welding moment is CONTENT.',
      'Optimize your bio with location and "Sunstone Certified."',
      'Engage genuinely — follow others, comment on posts, build community.',
      'Collaborate with local influencers and complementary businesses.',
      'Tell your brand story authentically.',
      'Use scheduling tools to stay consistent: Hootsuite, Buffer.',
      'Monitor analytics — track what content performs and do more of it.',
      'Integrate booking apps like Vagaro directly in your bio link.',
    ],
    contentLibrary: {
      what: '300+ images and videos provided to PJ University students.',
      purpose: 'Ready-made social media content to help artists launch their social presence immediately.',
      access: 'PJ University students only. Non-students can purchase access to PJ University.',
    },
    keyInsight:
      'People share the WELDING MOMENT on TikTok and Instagram, not just the finished piece. The process is the content. Encourage artists to capture and share every weld.',
  },

  // ---------------------------------------------------------------------------
  // Event Marketing
  // ---------------------------------------------------------------------------
  eventMarketing: {
    popUps: {
      preparation: [
        'Connect with event organizers early.',
        'Confirm vendor fees, booth rental details, and requirements (insurance?).',
        'Consider venue type (indoor vs outdoor) and adapt.',
        'Professional branded setup: table covers, signage, display lighting.',
        'Use a digital queue system for busy events.',
        'Social media pre-event hype — build anticipation.',
        'Live demos during the event to attract foot traffic.',
        'Collect contact info (email, social) from every customer.',
        'Post-event review — what worked, what to improve.',
      ],
    },
    houseParties: {
      preparation: [
        'Communicate clearly with the host about expectations.',
        'Set minimum guest requirement (recommend 5+ for free host bracelet).',
        'Calculate inventory: 3 pieces per person for stacking potential.',
        'Add special themed items for the occasion.',
        'Provide the host with a digital flyer showing host benefits.',
      ],
      hostIncentives: 'Free bracelet for the host if 5+ guests attend. Adjust based on drive time and logistics.',
    },
    brickAndMortar: {
      strategies: [
        'Storefront and in-store displays.',
        'Google My Business optimization + encourage reviews.',
        'Community events and workshops.',
        'Local advertising: direct mail, local magazines, sponsorships.',
        'Loyalty programs for repeat customers.',
        'Digital displays showing the welding process.',
      ],
    },
  },

  // ---------------------------------------------------------------------------
  // Networking
  // ---------------------------------------------------------------------------
  networking: {
    groups: [
      'Chamber of Commerce',
      'BNI (Business Network International)',
      'Women entrepreneur groups',
      'LinkedIn / Facebook groups / Instagram hashtags for PJ community',
    ],
    facebookGroups: [
      'Sunstone PJ Community (Sunstone\'s official group)',
      'Original Permanent Jewelry Community',
      'Permanent Jewelry Startup',
      'Permanent Jewelry Newbies',
      'Permanent Jewelry Business Tips',
      'Permanent Jewelry Community + Support',
    ],
    collaborations: [
      'Event sponsoring',
      'Charitable fundraisers (great exposure and community building)',
      'Exclusive boutique nights',
      'Cross-promotion with complementary beauty businesses',
    ],
    pjxConference: {
      what: 'The only conference exclusively for permanent jewelry artists.',
      frequency: 'Annual',
      next: 'June 2026, Las Vegas',
      website: 'www.pjexpo.org',
      value: [
        'Meet suppliers and discover new products.',
        'Network with artists from around the country.',
        'Attend classes on welding, business, and marketing from industry experts.',
        'Get business ideas that are working in other markets.',
        'The connections are the #1 reported benefit by attendees.',
      ],
      sunnyCanShare: true,
    },
  },

  // ---------------------------------------------------------------------------
  // Event Packing Checklist
  // ---------------------------------------------------------------------------
  eventPackingChecklist: {
    mainSetup: [
      'Tables and coverings', 'Chairs', 'Stool for anklets', 'Display signage and backdrops',
      'Tabletop signage (price list, FAQs, social media, how to pay)',
      'Canopy/tent/weights (outdoor)', 'Fan or heater', 'Additional shelves or racks',
      'Power bank, power bars, extension cords',
      'Ring light and phone holder for photos/video', 'Additional lights and extra bulbs',
      'Business cards and holder', 'Care packages for PJ purchases',
      'Clipboard/tablet for waiver forms', 'Mirror', 'Magnifying glass',
      'Product covers (multi-day events)',
    ],
    stockAndWelder: [
      'Welder and power cords', 'Stylus', 'Extra tungsten electrodes', 'Tungsten sharpener',
      'Stylus holder or optics (ADL/Scope)', 'Argon tubing, tank, and regulator',
      'Ground clips or pliers', 'Protective leather patch', 'Fiberglass brush',
      'Chain nose pliers', 'Flush cutters', 'Protective glasses',
      'Tools and accessories bag', 'Armrest/cushion',
      'Jump rings (+ dish)', 'Dish for chain cuttings',
      'Chain display and display chains', 'Chain stock', 'Jump ring stock',
      'Clasp stock (if offered)', 'Charm and connector display + stock',
    ],
    paymentAndPOS: [
      'Cash and cash box/money bag', 'Phone/tablet/laptop with chargers',
      'Credit card reader', 'Printer', 'Portable WiFi stick',
    ],
    extras: [
      'Pens, pencils, markers', 'Extra paper/notebook', 'Stapler',
      'Packing tape', 'Twist ties', 'Calculator', 'Saran wrap (for displays)',
      'Zip lock bags', 'Scissors', 'Zip ties',
      'Wet wipes', 'Hand sanitizer', 'Sunscreen', 'Kleenex',
      'Water', 'Snacks', 'Cooler', 'Extra garbage bags',
    ],
  },
};

// =============================================================================
// SECTION 8: PJ UNIVERSITY & SUNNY'S ROLE
// =============================================================================
export const PJ_UNIVERSITY_AND_SUNNY_ROLE = {
  // ---------------------------------------------------------------------------
  // PJ University Structure
  // ---------------------------------------------------------------------------
  pjUniversity: {
    overview: 'Two courses, ~20 modules each (~40 total classes), with a completion certificate ("Sunstone Certified") for each course.',
    includedWith: 'All starter kits (Momentum, Dream, Legacy) include PJ University access.',
    loginUrl: 'https://permanentjewelry-sunstonewelders.thinkific.com/users/sign_in',
    accessNote: 'Artists receive PJ University login information in their welcome email after purchasing their kit. If they cannot find it, direct them to Sunstone support at 385-999-5240.',
    additionalResources: [
      '300+ images and videos for social media content',
      'Event packing checklist',
      'Facebook support groups list',
      '30-day fast track calendar',
      'Helpful business resources and links',
      'Sample consent form and waiver templates',
      'Sample price list',
      'Trusted suppliers list (45+ suppliers)',
      'Weld settings chart (also on Sunstone website)',
      'Sample tarnish replacement policy',
      'Sample lost chain replacement policy',
      'Photo/video consent form template',
    ],

    course1: {
      name: 'PJ Mastery Series: The Sunstone Method',
      focus: 'Hands-on welding technique and customer experience',
      sections: {
        introductionAndSetup: [
          'Welcome to the Sunstone Method',
          'Zapp Plus 2 - Setup & Overview',
          'mPulse Setup Guide',
          'Zapp Plus Setup Guide',
          'Argon Set Up and Electrode Maintenance',
          'Optics Set Up Guide',
        ],
        understandingMaterials: [
          'Metals Deep Dive',
          'Semi-Precious Metals Deep Dive',
          'Choosing the Right Chain',
        ],
        fundamentalsOfMicroTIGWelding: [
          'Handling Jump Rings',
          'Welding Basics',
          'Safety and Measuring for PJ',
        ],
        advancedPJWeldingTechniques: [
          'Stylus technique and bracelet welding',
          'Rings & Hand Chains',
          'Crafting Necklaces',
          'Anklets - How to do it',
        ],
        customerExperience: [
          'Upselling Charms & Connectors',
          'Troubleshooting',
          'Aftercare',
        ],
        storageAndMarketing: [
          'Storing & Transporting Materials',
          'Being Sunstone Certified',
        ],
      },
      // Flat list for backward compatibility
      modules: [
        'Welcome to the Sunstone Method',
        'Zapp Plus 2 - Setup & Overview',
        'mPulse Setup Guide',
        'Zapp Plus Setup Guide',
        'Argon Set Up and Electrode Maintenance',
        'Optics Set Up Guide',
        'Metals Deep Dive',
        'Semi-Precious Metals Deep Dive',
        'Choosing the Right Chain',
        'Handling Jump Rings',
        'Welding Basics',
        'Safety and Measuring for PJ',
        'Stylus technique and bracelet welding',
        'Rings & Hand Chains',
        'Crafting Necklaces',
        'Anklets - How to do it',
        'Upselling Charms & Connectors',
        'Troubleshooting',
        'Aftercare',
        'Storing & Transporting Materials',
        'Being Sunstone Certified',
      ],
    },

    course2: {
      name: 'Business Foundations for PJ Professionals',
      focus: 'Business building, marketing, and growth strategy',
      sections: {
        introductionToPermanentJewelry: [
          'What is Permanent Jewelry',
          'The Permanent Jewelry Experience',
          'The Different Types of Permanent Jewelry',
          'The Financial Potential of Your Permanent Jewelry Business',
        ],
        productManagement: [
          'Choosing the Right Chains and Jump Rings',
          'Working with Charms, Connectors and Inventory',
        ],
        theCustomerExperience: [
          'Welding Permanent Jewelry: Step by Step',
          'Completing the Customer Experience: Aftercare',
        ],
        businessFoundations: [
          'Choosing a Legal Entity: Sole Proprietor and LLC',
          'Protecting Your Business with Insurance',
          'Managing Finances and Customer Checkout',
        ],
        marketing: [
          'Creating Your Unique Brand',
          'Creating a Logo and Marketing Your Brand',
          'Pricing Strategies for Permanent Jewelry',
          'Diving into Social Media Marketing',
          'How to Plan and Execute a House Party',
          'Maximizing Your Pop-Up Presence',
          'Marketing a Brick & Mortar Location',
          'Growing Your Business Through Networking',
        ],
        nextSteps: [
          'Building Your Permanent Jewelry Empire',
        ],
      },
      // Flat list for backward compatibility
      modules: [
        'What is Permanent Jewelry',
        'The Permanent Jewelry Experience',
        'The Different Types of Permanent Jewelry',
        'The Financial Potential of Your Permanent Jewelry Business',
        'Choosing the Right Chains and Jump Rings',
        'Working with Charms, Connectors and Inventory',
        'Welding Permanent Jewelry: Step by Step',
        'Completing the Customer Experience: Aftercare',
        'Choosing a Legal Entity: Sole Proprietor and LLC',
        'Protecting Your Business with Insurance',
        'Managing Finances and Customer Checkout',
        'Creating Your Unique Brand',
        'Creating a Logo and Marketing Your Brand',
        'Pricing Strategies for Permanent Jewelry',
        'Diving into Social Media Marketing',
        'How to Plan and Execute a House Party',
        'Maximizing Your Pop-Up Presence',
        'Marketing a Brick & Mortar Location',
        'Growing Your Business Through Networking',
        'Building Your Permanent Jewelry Empire',
      ],
    },
  },

  // ---------------------------------------------------------------------------
  // 1:1 Mentoring
  // ---------------------------------------------------------------------------
  mentoring: {
    includedWith: ['Dream kit ($3,199)', 'Legacy kit ($4,999)'],
    notIncludedWith: ['Momentum kit ($2,399)'],
    duration: '90 days from purchase date',
    what: 'Access to a PJ expert for personalized coaching above and beyond regular Sunstone support.',
    bookingUrl: 'https://outlook.office.com/book/SunstoneSuccessCoach@sunstonewelders.com/?ismsaljsauthenabled',
    bookingNote: 'Dream and Legacy kit owners can book mentoring sessions using the link above. They also received this in their welcome email.',
    sunnyAwareness:
      'Sunny should be aware that Dream/Legacy customers may have received specific advice from their mentor. Don\'t contradict mentoring guidance — if there\'s a conflict, suggest they follow up with their mentor or Sunstone support.',
  },

  // ---------------------------------------------------------------------------
  // 30-Day Fast Track
  // ---------------------------------------------------------------------------
  fastTrack: {
    overview: 'A day-by-day calendar for the first 30 days after purchasing a kit.',
    schedule: {
      day1: 'Register business, secure social media handles, join Sunstone PJ Community on Facebook.',
      week1: 'Set up LLC, obtain liability insurance, organize workspace, set up welding equipment, practice welding with friends and family, experiment with different metals and jump ring sizes. SUNSTONE CHECK-IN.',
      week2: 'Plan and order inventory (chains, jump rings, charms). Order care cards, pricing materials, chain displays. Continue practicing welding techniques. Take photos/videos for content.',
      week3: 'Post first social media content. Create bio and highlight bubbles. Engage online (follow, comment, build community). Plan first pop-up or house party. SUNSTONE CHECK-IN.',
      week4: 'Host first event. Reflect and make notes for improvement. Collect content and reviews. Continue social media engagement. Plan to attend upcoming events (like PJX). Review the month and set goals. Celebrate!',
    },
  },

  // ---------------------------------------------------------------------------
  // Sunny's Personality & Communication Style
  // ---------------------------------------------------------------------------
  sunnyPersonality: {
    coreTone: 'Empathetic mentor with "You can do this!" energy. Warm, encouraging, knowledgeable.',
    adaptive: 'Reads the room. Adjusts tone to match the conversation — celebratory when they\'re winning, supportive when they\'re struggling, direct when they need honest guidance.',
    notRoboticCheerleader: 'Genuine encouragement, not empty positivity. If the suggestion requires more hard work, say so with kindness.',
    withStrugglingArtists: {
      approach: 'Lead with encouragement and empathy. Validate their feelings. Then redirect toward actionable next steps.',
      philosophy: 'This is a real business that requires time and effort. It\'s not get-rich-quick — even though fast success is possible. The opportunity is real, but so is the work.',
      ifTheyWantToQuit: 'Encourage for a bit, but if they\'re serious about returns, refer to Sunstone support. Respect their decision while making sure they know the door is open.',
    },
  },

  // ---------------------------------------------------------------------------
  // Sunny's Knowledge Boundaries
  // ---------------------------------------------------------------------------
  sunnyBoundaries: {
    whenSunnyDoesntKnow: {
      firstResponse: '"Let me check on that for you..."',
      approach: 'Try 2–3 attempts to find or reason through an answer.',
      escalation: 'If the customer is frustrated or Sunny can\'t resolve quickly, refer to Sunstone support: call or text 385-999-5240.',
    },
    competitorWelders: {
      stance: 'Always take the high road. No trash talk.',
      ifAskedDirectly: {
        story: '"Sunstone has been engineering micro welding technology for industries that demand perfection for nearly 20 years. Others entered the PJ space to capitalize on a trend. We were here first and we\'ll be here when they\'re gone."',
        forFeatureComparisons: 'Refer to Sunstone support for detailed competitive comparisons.',
      },
      ifHelpingNonSunstoneUser: 'Help them generically with welding technique. Don\'t refuse assistance, but don\'t troubleshoot competitor hardware specifically.',
    },
    nonSunstoneChains: {
      stance: 'Help freely. Most artists use multiple suppliers — this is expected and normal.',
      caveat: 'Note that Sunstone cannot guarantee the quality of materials from other suppliers.',
    },
    pjUniversityAccess: {
      checkFirst: 'Verify if the user is a PJ University student or purchased training from Sunstone.',
      ifStudent: 'Refer to specific PJ University modules and resources by name.',
      ifNotStudent: 'Mention PJ University exists as a resource. Don\'t hard-sell it.',
    },
    cruiseShips: {
      stance: 'Do not mention cruise ship PJ operations to artists. If asked about unique venues, steer toward resorts and souvenir-type locations.',
      reason: 'Sunstone is working directly with cruise lines — this is not relevant to independent artists.',
    },
    discounting: {
      stance: 'NEVER recommend discounting. Always steer toward value, differentiation, and "you are worth it" messaging.',
    },
  },

  // ---------------------------------------------------------------------------
  // Support Resources
  // ---------------------------------------------------------------------------
  supportResources: {
    sunstoneSupport: {
      phone: '385-999-5240',
      method: 'Call or text',
      for: ['Equipment malfunction', 'Account issues', 'Return policy questions', 'Edge cases beyond Sunny\'s knowledge', 'Competitive comparisons'],
    },
    communityGroups: [
      { name: 'Sunstone PJ Community (Facebook — official)', url: 'https://www.facebook.com/share/g/1G8g5gFmqs/' },
      { name: 'Original Permanent Jewelry Community (Facebook)', url: 'https://www.facebook.com/share/g/1B5na4wges/' },
      'Permanent Jewelry Startup (Facebook)',
      'Permanent Jewelry Newbies (Facebook)',
      'Permanent Jewelry Business Tips (Facebook)',
      'Permanent Jewelry Community + Support (Facebook)',
    ],
    pjxConference: {
      website: 'www.pjexpo.org',
      next: 'June 2026, Las Vegas',
    },
  },
};

// =============================================================================
// SECTION 9: PJOS PLATFORM GUIDE
// =============================================================================
// This section teaches Sunny how the Sunstone PJOS app itself works so she can
// answer questions like "how do I create an event?" or "where are my reports?"
// =============================================================================
export const PJOS_PLATFORM_GUIDE = {
  // ---------------------------------------------------------------------------
  // 9.1 Getting Started / Onboarding
  // ---------------------------------------------------------------------------
  gettingStarted: {
    overview: 'When you first sign up for Sunstone Studio, you go through a guided onboarding experience powered by Sunny. It walks you through naming your business, loading your starter kit inventory, setting prices, and picking a theme — all in one smooth flow.',
    onboardingFlow: {
      steps: [
        '0. Welcome screen — greets you by first name with a letter-by-letter animation.',
        '1. Business Name — confirms or edits the name you entered at signup.',
        '2. Phone Number — optional, with SMS consent checkbox. Stored on your tenant record.',
        '3. Experience Level — how long you have been doing permanent jewelry (just starting, <1 year, 1-3 years, 3+ years).',
        '4. Kit Selection — pick your Sunstone starter kit (Momentum, Dream, or Legacy) or skip if you did not buy one. Selecting a kit auto-populates your inventory with the exact chains, jump rings, and connectors from that kit.',
        '5. Pricing Setup — choose how to price your jewelry: by product type (flat price), by metal (silver vs gold), by markup percentage, or price later individually.',
        '6. Theme Picker — choose from 9 visual themes that change colors, fonts, and feel throughout the app. Live preview as you tap.',
        '7. Grand Reveal — summary of your setup with a "Start Exploring" button that takes you to the dashboard.',
      ],
      skipOption: 'You can skip setup at any time using the "Skip setup" link in the top right. Your progress is saved — you can resume later.',
      resuming: 'If you close the browser or leave, the onboarding picks up where you left off.',
    },
    starterKits: {
      momentum: {
        price: '$2,399',
        chains: ['Chloe (14/20 Yellow Gold-Filled)', 'Olivia (14/20 Yellow Gold-Filled)', 'Marlee (14/20 White Gold-Filled)', 'Lavina (Sterling Silver)', 'Ella (Sterling Silver)', 'Paisley (Sterling Silver)', 'Maria (14/20 Yellow Gold-Filled)'],
        jumpRings: '25 Sterling Silver + 25 Gold-Filled',
        connectors: 'Not included',
        gas: '2x Argon Mini + 1x Argon Regulator',
      },
      dream: {
        price: '$3,199',
        chains: ['All 7 Momentum chains + Alessia (Sterling Silver) + Benedetta (Sterling Silver)'],
        jumpRings: '50 Sterling Silver + 50 Gold-Filled',
        connectors: 'Birthstone Connectors — Sterling Silver set + 14/20Y Gold-Filled set + Display Case',
        gas: '2x Argon Mini + 1x Argon Regulator',
      },
      legacy: {
        price: '$4,999',
        chains: ['All 9 Dream chains + Charlie (14/20 Yellow Gold-Filled), Lucy (14/20 White Gold-Filled), Grace (14/20 Yellow Gold-Filled), Bryce (Sterling Silver), Hannah (14/20 Yellow Gold-Filled), Ruby (Sterling Silver)'],
        jumpRings: '100 Sterling Silver + 100 Gold-Filled',
        connectors: 'Birthstone Connectors — Sterling Silver set + 14/20Y Gold-Filled set + Display Case',
        gas: '4x Argon Mini + 1x Argon Regulator',
      },
    },
    pricingOptions: {
      byType: 'Set a flat price for all pieces (e.g. $45 per bracelet/anklet). Simple and easy.',
      byMetal: 'Different prices for silver vs gold-filled chains.',
      byMarkup: 'Set a profit margin percentage over your cost. E.g. 50% margin = sell for 2x cost.',
      individual: 'Skip and set prices individually in the Inventory page later.',
    },
    tips: [
      'You can always come back to Settings to update anything.',
      'Your logo shows up on waivers, receipts, and your customer-facing pages.',
      'Pick an accent color that matches your brand — it shows throughout the app.',
    ],
    trialNote: 'New accounts start with a 60-day Pro trial so you can explore all features. After the trial, you can upgrade or continue on the Starter plan.',
  },

  // ---------------------------------------------------------------------------
  // 9.1b Sunny Tips (Per-Page Tutorials)
  // ---------------------------------------------------------------------------
  sunnyTips: {
    overview: 'On each main page of Sunstone Studio, owners see a floating "Sunny\'s Tips" pill in the bottom right. Tapping it opens a guided walkthrough with 2-3 tips specific to that page. Once you tap "Got it" on the last tip, the pill disappears permanently for that page.',
    pages: {
      events: 'Tips about creating events, going live, QR codes.',
      inventory: 'Tips about adding items, stock levels, chain pricing.',
      pos: 'Tips about ringing up sales and checkout.',
      clients: 'Tips about auto-created clients and using tags.',
      settings: 'Tips about payment processors and tax rates.',
      reports: 'Tips about date filters and CSV export.',
    },
    note: 'Only business owners see Sunny\'s Tips. Team members skip them.',
  },

  // ---------------------------------------------------------------------------
  // 9.1c Dashboard Getting Started Checklist
  // ---------------------------------------------------------------------------
  dashboardChecklist: {
    overview: 'The dashboard shows a Getting Started card with 5 checks. As you complete each one, it marks green.',
    checks: [
      '1. Payment processor connected (Square or Stripe)',
      '2. First event created',
      '3. Inventory added',
      '4. First sale completed',
      '5. Tax rate set',
    ],
    dismissing: 'You can dismiss the Getting Started card after completing all items or by tapping "Dismiss" in the card menu.',
  },

  // ---------------------------------------------------------------------------
  // 9.2 Events
  // ---------------------------------------------------------------------------
  events: {
    overview: 'Events are how you organize your pop-ups, private parties, and bridal events in Sunstone Studio. Each event gets its own sales tracking, queue, and QR code.',
    creatingAnEvent: [
      '1. Go to Events in the sidebar.',
      '2. Click the "+ New Event" button in the top right.',
      '3. Fill in the event name, location, date/time, and booth fee.',
      '4. Choose a tax profile if applicable.',
      '5. Optionally limit which product types are available for this event.',
      '6. Click "Create Event" and you are all set!',
    ],
    eventTypes: {
      popup: 'Farmers markets, craft fairs, festivals — your typical public event.',
      privateParty: 'House parties, bridal showers, birthday parties — intimate private gatherings.',
      bridal: 'Bridal events, wedding parties — set these up the same way, just name them accordingly.',
    },
    eventTabs: 'Your Events page has three views: Live Now (events happening right now with a green dot), Upcoming (future events), and Past Events (completed events with P&L data).',
    startingEventMode: [
      '1. Find your event on the Events page.',
      '2. Click "Go Live" (for active events) or "Event Mode" (for upcoming events).',
      '3. This takes you to the Event Mode POS where you can start ringing up customers.',
    ],
    qrCode: 'Every event gets a QR code. Click the QR icon on the event card to display it. You can go full-screen to display it at your booth — customers scan it to fill out your waiver and join your queue.',
    editingEvents: 'Click the Edit button on any event card to update the name, time, location, booth fee, or product availability.',
    viewingPL: 'For past events, click "View P&L" to see a full profit-and-loss breakdown including revenue, costs, and your actual profit.',
  },

  // ---------------------------------------------------------------------------
  // 9.3 Event Mode POS
  // ---------------------------------------------------------------------------
  eventModePOS: {
    overview: 'Event Mode POS is your sales screen during a live event. It walks you through adding items to the cart, applying discounts and tips, and completing the sale.',
    addingChainItems: [
      '1. Pick the product type (Bracelet, Anklet, Necklace, etc.).',
      '2. Pick the material (Gold Filled, Sterling Silver, etc.).',
      '3. Pick the specific chain from your inventory.',
      '4. Enter the measurement in inches — the price calculates automatically based on your pricing.',
      '5. The item gets added to your cart.',
    ],
    addingOtherItems: 'Jump rings, charms, connectors, and other items appear as quick-add buttons. Just tap them to add to the cart.',
    customItems: 'Need to add something special? Use the Custom Item form — type a name and price, and it goes right into the cart.',
    discounts: {
      perItem: 'You can apply a discount to individual items in the cart.',
      cartLevel: 'You can also apply a discount to the entire cart total.',
    },
    tips: 'During checkout, your customer can add a tip. You will see preset amounts (like $3, $5, $10, $15, $20) or they can enter a custom amount.',
    paymentMethods: 'Choose how they are paying: Card, Cash, Venmo, or Other. For card payments, you will need your payment processor (Square or Stripe) connected in Settings.',
    completingASale: [
      '1. Review the cart — items, discounts, tax, and tip.',
      '2. Select the payment method.',
      '3. Complete the sale.',
      '4. Send a receipt via email or SMS if the customer wants one, or download a PDF.',
      '5. Click "Start New Sale" to help the next customer.',
    ],
    inventoryDeduction: 'When you sell a chain item, the app automatically deducts the inches used from your inventory. Jump rings used are also tracked.',
    queueIntegration: 'During Event Mode, you will see a mini queue strip showing who is next in line. This helps you call the next customer without leaving the sales screen.',
  },

  // ---------------------------------------------------------------------------
  // 9.4 Store Mode POS
  // ---------------------------------------------------------------------------
  storeModePOS: {
    overview: 'Store Mode is for everyday sales when you are not at an event — walk-ins at your salon, studio, or shop.',
    howToAccess: 'From the Events page, click the "Store Mode" button at the top. You can also access it from the sidebar if configured.',
    differences: [
      'Store Mode has no event context — sales are tracked under "Store" instead of a specific event.',
      'All your inventory items are available (no event-based product filtering).',
      'Customers are walk-ups rather than from an event queue.',
      'You will see "Today\'s Sales" with a count and running total at the top.',
    ],
    sameFeatures: 'The actual sales process is identical to Event Mode — same product selection steps, cart, discounts, tips, and payment methods.',
  },

  // ---------------------------------------------------------------------------
  // 9.5 Inventory
  // ---------------------------------------------------------------------------
  inventory: {
    overview: 'The Inventory page is where you manage all your chains, jump rings, charms, connectors, and other supplies.',
    addingItems: [
      '1. Go to Inventory in the sidebar.',
      '2. Click "+ Add Item" in the top right.',
      '3. Fill in the basics: name, type (Chain, Jump Ring, Charm, Connector, or Other), material, and supplier.',
      '4. Enter your stock levels: quantity on hand and reorder threshold.',
      '5. Enter your cost (what you paid) and sell price (what you charge).',
      '6. Click "Add Item" to save.',
    ],
    chainProducts: {
      overview: 'Chains are special — you buy them by the inch (or foot) and sell them by the piece. The app handles this conversion for you.',
      buyByInch: 'Enter your chain quantity in inches and your cost per inch.',
      sellByPiece: 'Set up product types in Settings (like Bracelet, Anklet, Necklace) with prices. When you sell a bracelet, the app calculates the price based on inches measured.',
      perInchPricing: 'Alternatively, you can price chains per inch and the price scales with the measurement.',
    },
    jumpRingTracking: 'Jump rings track quantity on hand. When you complete a sale, jump rings are automatically deducted based on the product type (most use 1 jump ring, hand chains use 2).',
    restocking: 'Update your quantity on hand anytime by editing the item. The reorder threshold triggers a visual alert when stock runs low.',
    lowStockAlerts: 'When an item drops below its reorder threshold, you will see it flagged. Keep an eye on your chain footage and jump ring counts before events.',
    searchAndFilter: 'Use the search bar to find items by name, material, or SKU. Filter by type (Chain, Jump Ring, etc.) or toggle "Show inactive" to see deactivated items.',
    deactivating: 'Click the eye icon to deactivate an item without deleting it. Deactivated items will not show up in your POS but the data is preserved.',
    productTypes: 'Set up your product types in Settings (like Bracelet, Anklet, Necklace, Ring, Hand Chain). Each product type defines how many jump rings it needs — most use 1, hand chains use 2.',
    materials: 'Set up your materials in Settings (like Sterling Silver, 14K Gold Filled Yellow, etc.). These help you organize inventory and show the right options during sales.',
  },

  // ---------------------------------------------------------------------------
  // 9.6 Clients
  // ---------------------------------------------------------------------------
  clients: {
    overview: 'The Clients page shows everyone who has signed a waiver or been added to your client list. Think of it as your customer database.',
    viewingClients: [
      '1. Go to Clients in the sidebar.',
      '2. Browse or search by name, email, or phone.',
      '3. Click on a client to see their signed waivers.',
    ],
    clientDetails: 'Each client card shows their name, phone, email, and how many waivers they have signed. Click to see all their waiver history.',
    waiverHistory: 'In the client detail view, you can see every waiver they have signed, when they signed it, and which event it was for. You can download any waiver as a PDF.',
    addingManually: [
      '1. Click "+ Add Client" at the top of the Clients page.',
      '2. Enter their first name, last name, and optionally their email and phone.',
      '3. Click "Add Client" to save.',
    ],
    copyWaiverLink: 'Click the "Copy Waiver Link" button at the top to get a shareable link. Send this to customers so they can fill out their waiver before they arrive — saves time at events!',
    tierNote: 'Full CRM features are available on Pro and Business plans. Starter plan users can still view clients who have signed waivers.',
  },

  // ---------------------------------------------------------------------------
  // 9.6b CRM Value Proposition
  // ---------------------------------------------------------------------------
  crmValue: {
    whatItDoes: 'CRM turns your client list into a relationship engine. Instead of hoping customers come back, you stay top of mind automatically.',
    realBenefits: [
      'Automated follow-ups mean you never forget a client. After every weld, your aftercare text goes out automatically — you look professional without lifting a finger.',
      'Birthday messages, event invitations, and re-engagement texts go out on their own. Clients feel remembered and valued, which is what brings them back.',
      'Tag your clients (VIP, Girls Night, Repeat Client) and send targeted broadcasts. Instead of blasting everyone, you reach the right people with the right message.',
      'Workflow automation handles the boring stuff — the thank-you text, the aftercare reminder, the review request, the party invite — all timed perfectly so you can focus on welding. Workflows can be triggered by purchase events, tag additions, or manual enrollment. You can set up a workflow to auto-enroll anyone who gets tagged with a specific event name — so every customer from "Saturday Pop Up at Tuacahn" automatically gets your follow-up sequence. You can also bulk-enroll everyone with a specific tag into any workflow.',
      'Every message, purchase, waiver, and interaction is logged on the client profile. When Sarah walks up to your booth six months later, you know exactly what she got last time.',
      'Private party invitations practically sell themselves when you can text everyone who loved their last piece and say "bring 5 friends, host gets a free bracelet."',
    ],
    whyItMatters: 'Most permanent jewelry artists lose 80% of their clients after the first visit — not because the client didn\'t love it, but because no one followed up. CRM changes that. It turns one-time customers into repeat clients, repeat clients into referral sources, and referral sources into private party hosts. That\'s how a side hustle becomes a real business.',
    howArtistsActuallyUseIt: [
      'After a market: automated sequence thanks everyone, sends aftercare, asks for an Instagram tag, then a week later asks for a review and mentions private parties',
      'Before an event: send a broadcast to all local clients saying "We will be at Spring Market this Saturday — come add to your collection"',
      'Birthday month: automatic birthday text makes the client feel special and gives you a reason to reconnect',
      'Slow season: send a "miss you" text to clients who haven\'t visited in 90+ days — simple, personal, effective',
      'Private parties: one text to your Girls Night tagged clients fills your party calendar',
    ],
  },

  // ---------------------------------------------------------------------------
  // 9.7 Queue Management
  // ---------------------------------------------------------------------------
  queueManagement: {
    overview: 'The Queue system keeps your line organized at events. Customers join by scanning your QR code and filling out a waiver, then appear in your queue automatically.',
    howCustomersJoin: [
      '1. Display your event QR code at your booth (click the QR icon on your event card, then go full-screen).',
      '2. Customers scan the QR code with their phone.',
      '3. They fill out the digital waiver and sign it.',
      '4. Once submitted, they automatically appear in your queue as "Waiting."',
    ],
    managingTheQueue: [
      '1. Go to Queue in the sidebar.',
      '2. Select which event\'s queue you want to view from the dropdown.',
      '3. You will see sections for Waiting, Notified, Served, and No Show.',
    ],
    notifyingCustomers: 'Click the "Notify Next" button to send an SMS to the next person in line letting them know it is their turn. Their status changes from "Waiting" to "Notified."',
    statusFlow: {
      waiting: 'Customer has signed the waiver and is in line.',
      notified: 'You sent them an SMS that it is their turn.',
      served: 'You have completed their service — mark them as served when done.',
      noShow: 'They did not show up — mark as no-show to move on.',
    },
    smsNotifications: 'When you notify a customer, the app sends them a text message if they provided their phone number on the waiver.',
    realTimeUpdates: 'The queue updates in real time — new customers appear automatically as they scan and submit their waiver.',
    eventModeMiniQueue: 'While in Event Mode POS, a mini queue strip shows at the top so you can see who is next without leaving the sales screen.',
  },

  // ---------------------------------------------------------------------------
  // 9.8 Digital Waivers
  // ---------------------------------------------------------------------------
  digitalWaivers: {
    overview: 'Sunstone Studio has a built-in digital waiver system. Customers fill out and sign the waiver on their phone before you even start their service.',
    howItWorks: [
      '1. Customer scans your event QR code (or you share the waiver link directly).',
      '2. They fill out their info: name, email, phone.',
      '3. They read and sign the waiver with their finger on screen.',
      '4. The signed waiver is saved to your account and the customer joins the queue.',
    ],
    signatureCapture: 'Customers sign right on their phone screen with their finger. The signature is captured and stored with the waiver.',
    pdfGeneration: 'Every signed waiver can be downloaded as a PDF from the Clients page — great for your records.',
    customWaiverText: 'Customize your waiver wording in Settings under "Waiver Text." Write it to match your business and your local requirements.',
    sharingTheLink: 'Two ways to share: (1) Display the QR code at your booth for walk-ups, or (2) Copy the waiver link from the Clients page and text/email it to customers in advance.',
    preEventStrategy: 'For private parties and booked appointments, send the waiver link ahead of time. Customers arrive already signed in and in the queue — you can start welding immediately.',
  },

  // ---------------------------------------------------------------------------
  // 9.9 Payments & Checkout
  // ---------------------------------------------------------------------------
  paymentsAndCheckout: {
    overview: 'Sunstone Studio has integrated Stripe payments built right into the POS. Customers pay by scanning a QR code or tapping a text link — no card reader needed.',
    howCustomersPay: [
      '1. You ring up the sale in the POS (add items to cart, apply discounts/tips).',
      '2. Tap "Charge Customer" to generate a Stripe Checkout session.',
      '3. A QR code appears on your screen. The customer scans it with their phone camera.',
      '4. They complete payment on Stripe Checkout — Apple Pay, Google Pay, or credit/debit card.',
      '5. You see the confirmation instantly in the POS and the sale is recorded.',
    ],
    textToPayOption: 'If the customer is remote or prefers a text, tap "Send via Text" to send a payment link to their phone number. They tap the link and pay through the same Stripe Checkout experience.',
    processingFees: {
      model: 'The processing fee is added to the CUSTOMER\'s checkout total. You always keep your full sale amount.',
      rates: {
        starter: '3% added to the customer\'s total',
        pro: '1.5% added to the customer\'s total',
        business: '0% — your customers pay no processing fee',
      },
      example: 'A $50 bracelet on Starter: customer pays $51.50, you receive $50. On Business: customer pays $50, you receive $50.',
    },
    externalPayments: {
      overview: 'Not every customer wants to pay through the app. You can record external payments for customers who pay with cash, Venmo, or their own card reader.',
      methods: ['Cash — record the amount received', 'Venmo — customer sends you payment via Venmo', 'External card — use your own Square reader, Clover, or any card terminal outside the app'],
      howTo: 'In the POS payment screen, tap "Record External Payment" instead of "Charge Customer." Select the payment method and confirm.',
    },
    stripeConnect: {
      setup: 'Go to Settings → Payments and click "Connect Stripe." If you already have a Stripe account, sign in. If not, creating one takes about 5 minutes.',
      whatItDoes: 'Once connected, all payments flow through your Stripe account. You can see deposits, refunds, and payout history in your Stripe Dashboard.',
      noHardware: 'You do NOT need a card reader, terminal, or any external hardware. The customer\'s phone is the payment terminal.',
    },
    pendingPayments: 'If a customer starts a payment but hasn\'t completed it, you\'ll see it in the "Pending Payments" section. You can resend the link or cancel the session.',
    tips: [
      'Display the QR code on your iPad facing the customer — they scan and pay in seconds.',
      'For busy events, text-to-pay lets you keep the line moving while customers pay on their own time.',
      'Cash and Venmo sales are recorded in the POS for accurate reporting even though they don\'t go through Stripe.',
    ],
  },

  // ---------------------------------------------------------------------------
  // 9.10 Business Reports (renumbered from 9.9)
  // ---------------------------------------------------------------------------
  businessReports: {
    overview: 'The Reports page shows you how your business is doing with revenue breakdowns, sales trends, and event-by-event performance.',
    accessingReports: 'Go to your Dashboard — you will see an overview with key metrics. For detailed reports, you will find revenue breakdowns, sales trends, and event P&L data.',
    overviewTab: {
      metricsCards: 'At the top you will see Total Revenue, Total Sales Count, Average Sale Value, and Net Profit.',
      filters: 'Filter by date range (YTD, this month, last month, quarterly, or custom) and by source (all sales, events only, or store only).',
      revenueBreakdown: 'See your revenue split into subtotal, tax collected, tips, platform fees, and discounts. Your COGS (cost of goods sold) shows chain material costs and jump ring costs.',
      paymentBreakdown: 'See how customers are paying — Card, Cash, Venmo, or Other.',
    },
    eventsTab: 'View a list of past events with full P&L for each one. See sales count, revenue, costs, and profit per event. Click any event for the detailed breakdown.',
    csvExport: 'Download your data as a CSV file for your own spreadsheets or for your accountant.',
    tierNote: 'Full reports with detailed breakdowns are available on Pro and Business plans. Starter plan users see basic metrics.',
  },

  // ---------------------------------------------------------------------------
  // 9.11 Settings
  // ---------------------------------------------------------------------------
  settingsGuide: {
    overview: 'Settings is where you configure everything about your Sunstone Studio account. It has three tabs: General, Subscription, and Team.',
    generalTab: {
      businessInfo: 'Update your business name, type, phone, and website.',
      branding: 'Upload your logo (shows on waivers and receipts) and pick your accent color. There are 8 beautiful presets or enter any hex color.',
      paymentProcessing: 'Connect your Stripe account in the Payments section to accept payments via QR code and text link. No card reader needed — customers pay on their phone through Stripe Checkout.',
      taxProfiles: 'Add tax profiles with a name and rate (like "State Sales Tax — 6.5%"). Assign them to events so tax calculates automatically.',
      productTypes: 'Set up product types like Bracelet, Anklet, Necklace, Ring, Hand Chain. Each one defines how many jump rings it uses. You can reorder them.',
      materials: 'Add your materials (Sterling Silver, 14K Gold Filled, etc.) to organize your inventory.',
      suppliers: 'Add your suppliers for tracking where your inventory comes from.',
      waiverText: 'Customize the waiver your customers see and sign. Write it to cover your local requirements.',
    },
    subscriptionTab: 'See your current plan, trial status, and plan features. Upgrade or manage your subscription here.',
    teamTab: 'View your team members, their roles, and invite new ones. Manage who has access to what.',
    feeHandling: 'A small checkout fee is automatically included in your customer\'s total when they pay through Sunstone Studio — you always receive your full sale amount. On Starter it is 3%, Pro is 1.5%, and Business is 0%. This is not something you control — it is standard for the platform. You can reduce it by upgrading your plan, and Business plan eliminates it entirely.',
  },

  // ---------------------------------------------------------------------------
  // 9.12 Subscription & Billing
  // ---------------------------------------------------------------------------
  subscriptionAndBilling: {
    overview: 'Sunstone Studio has three subscription tiers designed to grow with your business. All plans include integrated Stripe payments — no card reader needed.',
    tiers: {
      starter: {
        price: '$99/month',
        processingFee: '3% processing fee (customer pays)',
        features: ['Basic POS (Event Mode and Store Mode)', 'Integrated Stripe payments (QR + text link)', 'Inventory management', 'Queue and waivers', '5 Sunny AI questions per month', '1 team member'],
        bestFor: 'Artists just getting started who want to try the platform.',
      },
      pro: {
        price: '$169/month',
        processingFee: '1.5% processing fee (customer pays)',
        features: ['Everything in Starter', 'Unlimited Sunny AI questions', 'Full business reports with P&L', 'AI insights', 'Client CRM', 'Up to 3 team members'],
        bestFor: 'Active artists who do regular events and want full business intelligence.',
      },
      business: {
        price: '$279/month',
        processingFee: '0% — zero processing fees for your customers',
        features: ['Everything in Pro', 'Unlimited team members', 'Priority support', 'Zero processing fees'],
        bestFor: 'High-volume artists or teams who want zero fees and unlimited team access.',
      },
    },
    crmAddOn: {
      overview: 'CRM is available as an add-on to any plan for $69/month. It replaces $200-400/month worth of separate tools (Mailchimp, SimpleTexting, HoneyBook, etc.) with one integrated solution built specifically for permanent jewelry artists.',
      pricing: '$69/month add-on to any plan — includes your own dedicated business phone number, two-way SMS conversations, automated aftercare sequences, broadcast messaging, client workflows, birthday automations, message templates, private party booking, and client intelligence.',
      includes: ['Your own dedicated business phone number', 'Two-way SMS conversations with clients', 'Messages inbox for all conversations', 'Automated aftercare sequences', 'Follow-up and re-engagement broadcasts', 'Broadcast messaging to client segments', 'Birthday and anniversary automations', 'Private party booking with RSVP tracking', 'Client intelligence and spending insights'],
      note: 'CRM features are included free during your 60-day Pro trial so you can see the full experience.',
      dedicatedNumber: 'Every CRM subscriber (or trial user) gets a dedicated phone number automatically provisioned when they sign up. This number appears in Settings → My Business. All outbound SMS (queue notifications, receipts, broadcasts, direct messages) send from your dedicated number instead of a shared platform number. Clients can text this number and their messages appear in the Messages inbox and on their client profile.',
      twoWayMessaging: 'The Messages page (in the sidebar) shows all SMS conversations across all clients. Click any conversation to see the full chat thread and reply. When a client texts your dedicated number, you get an unread badge on the Messages icon. You can also open a conversation directly from a client profile by tapping the Text button. Messages support up to 1,600 characters (10 SMS segments). All outbound messages also appear in the client activity timeline.',
      crmTrial: 'CRM features are included free during your 60-day Pro trial. After the trial, CRM becomes a $69/month add-on to any plan. If your trial expires without subscribing, CRM features (Messages, Broadcasts, Workflows) are locked but your data is preserved. Just activate CRM from Settings → Subscription to pick up where you left off.',
      autoReply: 'Event Mode Auto-Reply: When you are welding at an event, toggle auto-reply ON (the chat bubble icon in the event mode header). Clients who text your business number will instantly receive your custom auto-reply message, like "Thanks for your message! I am currently with a client but will get back to you soon." Customize the message in Settings → My Business → Messaging AI. This only sends when you toggle it on — it does not send all the time.',
      sunnyTextResponder: 'Sunny AI Text Responder has three modes you can set in Settings → My Business → Messaging AI. Off: you reply to all messages yourself. Suggest: Sunny drafts a response that appears as a suggestion in your conversation — tap it to use it, or ignore it. Auto-Send: Sunny automatically replies to client messages using your business context and conversation history. Great for when you are too busy to reply. All AI responses are natural and conversational, never robotic.',
      crmPage: 'Want to see everything the CRM includes? Check out sunstonepj.app/crm — it has a full breakdown of every feature, a comparison with other tools, pricing details, and answers to common questions. You can share this link with anyone curious about the CRM add-on.',
      workflows: 'Workflows are automated follow-up sequences that send timed messages to clients. Triggers: Event Purchase (after a sale at an event), Private Party Purchase (after a party sale), Tag Added (auto-enroll when a client gets a specific tag), or Manual. Tag-based workflows are powerful — create a workflow triggered by tag "Downtown Market" and every customer who buys there automatically enters your follow-up sequence. Event tags are added automatically when someone buys through Event Mode POS. You can also bulk-enroll all clients with a specific tag into any workflow from the workflow detail page. Example: bulk-enroll everyone tagged "VIP" into your VIP nurture sequence. Go to CRM → Workflows tab to create and manage workflows.',
      deactivation: 'If you deactivate CRM, your dedicated phone number is preserved for 30 days so you can reactivate without losing it. Your full conversation history is preserved indefinitely — just reactivate CRM to pick up where you left off.',
      incomingCalls: 'You control what happens when someone calls your dedicated business number. Text Only (default): Callers hear a greeting asking them to text instead — best for most artists since you are usually busy welding! Forward to My Phone: Calls ring through to your personal phone with your business number as the caller ID, so clients never see your personal number. If you do not answer within 30 seconds, they hear a message asking them to text instead. During Events: If "Mute calls during events" is on (it is by default), all calls automatically go to the text-only greeting while you are running an event — no interruptions while you are welding. You can set a custom greeting to make it personal, like "Hey! You reached Sarah\'s Sparkle Studio. Text me at this number and I\'ll get back to you quick!" Go to Settings → My Business → Incoming Calls to change these options.',
    },
    trial: 'New accounts get a 60-day Pro trial to explore all features including CRM. No credit card required to start. You can choose a plan anytime during your trial — your card won\'t be charged until the trial ends. This locks in your plan so there\'s no interruption when the trial expires.',
    trialWarnings: 'You\'ll see a banner at the top of the dashboard as your trial nears its end: at 14 days (info), 7 days (warning), and 3 days (urgent). These remind you to choose a plan before the trial expires.',
    choosingDuringTrial: 'We recommend choosing a plan early in your trial so there\'s no interruption. When you select a plan during your trial, your card is saved but won\'t be charged until the trial ends. You\'ll still have full Pro access until then. You can change or cancel anytime from Settings → Subscription.',
    upgrading: 'Go to Settings → Plan & Billing to see your current plan, select a new one, or manage your subscription through Stripe.',
    whatHappensAfterTrial: 'If your trial expires without choosing a plan, your dashboard is locked — you can see your data but can\'t use POS, CRM, or other features until you select a plan. All your data, events, inventory, clients, and conversation history are preserved — nothing is ever deleted. Just choose a plan from the lockout screen or Settings to pick up right where you left off.',
    crmRequiresBasePlan: 'CRM ($69/mo) is an add-on that requires a base plan (Starter, Pro, or Business). You can\'t purchase CRM standalone after your trial expires. During your trial, CRM is included free. After the trial, choose a base plan first, then add CRM.',
    feeExplainer: 'A small checkout fee (Starter 3%, Pro 1.5%, Business 0%) is automatically included in your customer\'s total at checkout — similar to other modern payment platforms. You always receive your full sale amount. The fee covers secure payment processing, instant receipts, and transaction tracking. Upgrade your plan to reduce or eliminate it.',
  },

  // ---------------------------------------------------------------------------
  // 9.13 Team Management
  // ---------------------------------------------------------------------------
  teamManagement: {
    overview: 'If you have staff or helpers, you can invite them to your Sunstone Studio account with different roles and permissions.',
    invitingMembers: [
      '1. Go to Settings → Team tab.',
      '2. Click "Invite Team Member."',
      '3. Enter their email address and select their role.',
      '4. They will receive an email invitation to join your account.',
    ],
    roles: {
      admin: 'Full access to everything — settings, reports, inventory, events, team management. This is you, the business owner.',
      manager: 'Can manage events, inventory, clients, and run the POS. Cannot change settings or manage the subscription.',
      staff: 'Can use the POS and manage the queue during events. Limited access to other areas.',
    },
    permissions: 'Each role has specific permissions. Admins see everything, managers see most things, and staff see what they need to serve customers.',
    tierLimits: {
      starter: '1 team member (just you).',
      pro: 'Up to 3 team members.',
      business: 'Unlimited team members.',
    },
    removing: 'To remove a team member, go to Settings → Team and click the delete icon next to their name.',
  },

  // ---------------------------------------------------------------------------
  // 9.14 Ask Sunny
  // ---------------------------------------------------------------------------
  askSunny: {
    overview: 'Sunny is your AI mentor built right into Sunstone Studio. She knows permanent jewelry techniques, Sunstone products, business strategy, and how the app works. She can search the live Sunstone product catalog (281+ products), manage your inventory, clients, events, and more — all through conversation.',
    howToAccess: 'Look for the chat icon in the bottom-right corner of any dashboard page. Click it to open Sunny.',
    whatSunnyHelps: [
      'Welding technique and settings — "What joule setting for 24g gold filled on the Zapp Plus 2?"',
      'Business advice and pricing strategy — "How should I price my bracelets?" or "What markup should I use?"',
      'Event planning and inventory calculations — "How much inventory should I bring to a 6-hour market?"',
      'App guidance — "How do I create an event?" or "Where do I find my reports?"',
      'Product knowledge — "What is the difference between gold filled and solid gold?"',
      'Search the Sunstone product catalog — "Show me gold fill chains" or "How much is the Chloe chain?"',
      'Manage your inventory — add items, update prices, check stock levels, set up starter kit chains',
      'Manage clients — look up client info, add tags, view waiver history',
      'Create and manage events — set up new events, view upcoming events, check P&L',
      'Pull revenue and sales reports — "How much did I make this month?"',
      'CRM workflows and templates — create follow-up sequences triggered by purchases, tags, or manual enrollment. Bulk-enroll clients by tag.',
      'Track expenses — add and view business expenses for accurate P&L',
      'Process refunds — help with refund workflows for completed sales',
      'Troubleshooting — "My welds keep breaking, what am I doing wrong?"',
      'Starter kit setup — "Add my Dream kit to inventory" with automatic chain details and pricing',
    ],
    questionLimits: {
      starter: '5 questions per month on the Starter plan.',
      proAndBusiness: 'Unlimited questions on Pro and Business plans.',
    },
    tips: [
      'Be specific with your questions — "What setting for 24g silver on the Zapp Plus 2?" gives better answers than "help with settings."',
      'Sunny can see your actual inventory, events, queue, and client data — ask her questions about YOUR business.',
      'If Sunny does not know something, she will flag it for the Sunstone team to add to her knowledge.',
    ],
  },

  // ---------------------------------------------------------------------------
  // 9.15 Platform Troubleshooting
  // ---------------------------------------------------------------------------
  platformTroubleshooting: {
    paymentProcessorNotConnected: {
      symptom: 'You cannot charge customers through the app, or the "Charge Customer" button is disabled.',
      fix: [
        '1. Go to Settings → Payments section.',
        '2. Click "Connect Stripe" and follow the onboarding flow.',
        '3. If you already have a Stripe account, sign in. If not, creating one takes about 5 minutes.',
        '4. Once connected, go back to the POS and try again.',
      ],
      tip: 'While you wait for Stripe, you can still use Cash, Venmo, or any external card reader by choosing "Record External Payment" in the POS.',
    },
    inventoryNotDeducting: {
      symptom: 'Your chain footage or jump ring count does not go down after a sale.',
      fix: [
        '1. Make sure the item is marked as active in Inventory.',
        '2. Check that your product types are set up in Settings and match your inventory items.',
        '3. Verify the chain is set up with per-inch pricing so the measurement can deduct correctly.',
        '4. If the issue persists, try editing the inventory item and re-saving it.',
      ],
    },
    smsNotSending: {
      symptom: 'Customers are not receiving text notifications from the queue.',
      fix: [
        '1. Verify the customer entered a valid phone number on the waiver.',
        '2. Check that you clicked "Notify Next" — the status should change to "Notified."',
        '3. SMS delivery can sometimes be delayed by the carrier — give it a minute.',
        '4. If it consistently fails, contact Sunstone support at 385-999-5240.',
      ],
    },
    cantInviteTeamMembers: {
      symptom: 'The "Invite Team Member" button is not working or you cannot add more people.',
      fix: [
        '1. Check your subscription tier — Starter allows 1 member, Pro allows 3, Business is unlimited.',
        '2. If you have hit your limit, upgrade your plan in Settings → Subscription.',
        '3. Make sure you are entering a valid email address.',
        '4. The invited person needs to check their email (including spam folder) for the invitation.',
      ],
    },
    qrCodeNotWorking: {
      symptom: 'Customers cannot scan the QR code or it does not load.',
      fix: [
        '1. Make sure the QR code is displayed clearly — use the full-screen mode.',
        '2. Check your internet connection — the customer\'s phone needs internet to load the waiver.',
        '3. If the QR is too small, try the full-screen option or print it larger.',
        '4. As a backup, use the "Copy Waiver Link" button on the Clients page and share the link directly.',
      ],
    },
    reportsNotShowing: {
      symptom: 'You cannot see detailed reports or see an upgrade prompt.',
      fix: 'Full reports with detailed P&L breakdowns are available on Pro and Business plans. If you are on the Starter plan, you will see basic metrics only. Upgrade in Settings → Subscription to unlock full reports.',
    },
    generalTip: 'For any issue you cannot resolve, contact Sunstone support at 385-999-5240 by call or text. They can also help with account-specific issues.',
  },

  // ---------------------------------------------------------------------------
  // 9.15 Gift Cards
  // ---------------------------------------------------------------------------
  giftCards: {
    overview: 'Sunstone Studio includes a built-in digital gift card system. Sell gift cards directly from the POS, deliver them via text or email, and redeem them at checkout. Gift cards are great for events where a customer wants to buy a gift for someone who is not present — it drives repeat visits and new client acquisition.',
    selling: {
      steps: [
        '1. In the POS (Store Mode or Event Mode), tap the gift card icon in the header bar.',
        '2. Choose a preset amount ($25, $50, $75, $100, $150) or enter a custom amount.',
        '3. Enter the recipient\'s name (required) and phone or email.',
        '4. Optionally add who it\'s from and a personal message.',
        '5. Choose delivery: Text, Email, Print/Tell, or None.',
        '6. Tap "Record External Payment" to complete the gift card sale.',
        '7. The recipient gets a text or email with their gift card code (e.g., ABCD-EFGH).',
      ],
      tips: [
        'Gift cards make great impulse purchases at events — have signage ready.',
        'The purchaser pays you directly (cash, Venmo, card) — then you create the gift card.',
        'Print/Tell delivery means you write the code down for the customer. No notification is sent.',
      ],
    },
    redeeming: {
      steps: [
        '1. During checkout, tap "Apply Gift Card" on the payment screen.',
        '2. Enter the 8-character code (with or without the dash).',
        '3. Tap "Look Up" to verify the card and see the balance.',
        '4. If the gift card covers the full amount, tap "Apply Full Amount" and the sale completes.',
        '5. If partial, the gift card amount is applied and you collect the remaining balance via another payment method.',
      ],
      partialRedemption: 'Gift cards support partial use. If a $100 card is used on a $60 order, $40 stays on the card for future use.',
    },
    managing: {
      overview: 'The Gift Cards page (in the sidebar) shows all cards you have sold with their status, balance, and history.',
      features: [
        'View summary stats: total sold, outstanding balance, fully redeemed, this month\'s revenue.',
        'Search by code, recipient, or purchaser name.',
        'Filter by status (Active, Redeemed, Expired, Cancelled).',
        'View full redemption history for any card.',
        'Resend the gift card notification (text or email).',
        'Cancel a gift card if needed.',
      ],
    },
    bestPractices: [
      'Promote gift cards at events with signage: "Can\'t stay? Grab a gift card!"',
      'Gift cards bring new clients — the recipient has to visit you to redeem.',
      'Track your outstanding balance to understand your gift card liability.',
      'Resend the notification if a recipient says they lost the code.',
    ],
  },
};

// =============================================================================
// COMBINED EXPORT (for easy import in PJOS)
// =============================================================================
export const SUNNY_MENTOR_KNOWLEDGE = {
  equipment: EQUIPMENT_KNOWLEDGE,
  weldingTechnique: WELDING_TECHNIQUE_KNOWLEDGE,
  troubleshooting: TROUBLESHOOTING_KNOWLEDGE,
  products: PRODUCTS_KNOWLEDGE,
  businessStrategy: BUSINESS_STRATEGY_KNOWLEDGE,
  clientExperience: CLIENT_EXPERIENCE_KNOWLEDGE,
  marketing: MARKETING_KNOWLEDGE,
  pjUniversityAndSunnyRole: PJ_UNIVERSITY_AND_SUNNY_ROLE,
  pjosPlatformGuide: PJOS_PLATFORM_GUIDE,
};