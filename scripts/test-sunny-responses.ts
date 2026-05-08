#!/usr/bin/env npx tsx
// =============================================================================
// Sunny Response Quality Test Suite
// =============================================================================
// Tests Sunny's ACTUAL responses by calling the mentor API endpoint.
// Checks that responses contain correct info and don't contain wrong info.
//
// Usage:
//   npx tsx scripts/test-sunny-responses.ts --token=<auth_token>
//   npx tsx scripts/test-sunny-responses.ts   (reads from .env.test SUNNY_TEST_TOKEN)
//
// This costs API credits — each test = 1 Sunny question. Run selectively.
// =============================================================================

import * as fs from 'fs';
import * as path from 'path';

// =============================================================================
// Configuration
// =============================================================================

const API_BASE = process.env.SUNNY_API_URL || 'http://localhost:3000';
const RATE_LIMIT_MS = 1200; // 1.2s between requests to avoid rate limiting
const RESULTS_DIR = path.join(__dirname, 'test-results');

// =============================================================================
// Test case structure
// =============================================================================

interface ResponseTestCase {
  id: string;
  category: string;
  question: string;
  mustContain: string[];
  mustNotContain: string[];
  notes?: string;
}

// =============================================================================
// 50+ response quality test cases
// =============================================================================

const TEST_CASES: ResponseTestCase[] = [

  // =========================================================================
  // SAFETY-CRITICAL: Weld Settings (12 tests)
  // =========================================================================
  {
    id: 'ws-001',
    category: 'Weld Settings',
    question: 'what setting for 26 gauge sterling silver on the zapp plus 2',
    mustContain: ['3'],
    mustNotContain: ['7', '8', '9', '10', '15'],
    notes: '26g SS on ZP2 = ~3 joules. Must NOT suggest high settings.',
  },
  {
    id: 'ws-002',
    category: 'Weld Settings',
    question: 'what joules for 24 gauge gold filled on the mpulse',
    mustContain: ['4', '5'],
    mustNotContain: ['10', '12', '15'],
    notes: '24g GF on mPulse = ~4.5. Must be in 4-5 range.',
  },
  {
    id: 'ws-003',
    category: 'Weld Settings',
    question: 'what setting for silver',
    mustContain: ['gauge', 'welder'],
    mustNotContain: [],
    notes: 'No gauge specified — MUST ask for gauge before answering.',
  },
  {
    id: 'ws-004',
    category: 'Weld Settings',
    question: 'what power for 20 gauge gold filled',
    mustContain: ['multiple'],
    mustNotContain: [],
    notes: '20g always requires multiple welds. Must mention this.',
  },
  {
    id: 'ws-005',
    category: 'Weld Settings',
    question: 'setting for 22 gauge gold filled on zapp plus 2',
    mustContain: ['6', '7', '8'],
    mustNotContain: ['15', '20'],
    notes: '22g GF on ZP2 = ~6-8 range.',
  },
  {
    id: 'ws-006',
    category: 'Weld Settings',
    question: 'what setting for 26 gauge 14k solid gold',
    mustContain: ['welder'],
    mustNotContain: [],
    notes: 'No welder specified — must ask which welder.',
  },
  {
    id: 'ws-007',
    category: 'Weld Settings',
    question: 'Im burning through 26 gauge chains what do I do',
    mustContain: ['low', 'power'],
    mustNotContain: [],
    notes: 'Burning through = power too high. Must suggest lowering.',
  },
  {
    id: 'ws-008',
    category: 'Weld Settings',
    question: 'my welds arent holding on 22 gauge',
    mustContain: ['power', 'increase'],
    mustNotContain: [],
    notes: 'Welds not holding = power too low or technique issue.',
  },
  {
    id: 'ws-009',
    category: 'Weld Settings',
    question: 'what setting for jump ring on 24 gauge sterling on zapp',
    mustContain: ['4', '5', '6'],
    mustNotContain: ['15', '20'],
    notes: '24g SS on Zapp = ~4-6 range.',
  },
  {
    id: 'ws-010',
    category: 'Weld Settings',
    question: 'what joules for rose gold 22g on zapp plus 2',
    mustContain: ['6', '7', '8'],
    mustNotContain: ['15', '20'],
    notes: 'Rose gold 22g ZP2 similar to gold filled range.',
  },
  {
    id: 'ws-011',
    category: 'Weld Settings',
    question: 'how many joules for white gold on mpulse',
    mustContain: ['gauge', 'welder'],
    mustNotContain: [],
    notes: 'No gauge — must ask.',
  },
  {
    id: 'ws-012',
    category: 'Weld Settings',
    question: 'whats the quick rule for weld settings by gauge',
    mustContain: ['3', '5', '7'],
    mustNotContain: ['15', '20'],
    notes: 'Quick rule: 26g~3, 24g~5, 22g~7, 20g~9-10.',
  },

  // =========================================================================
  // AFTERCARE POLICY ACCURACY (8 tests)
  // =========================================================================
  {
    id: 'af-001',
    category: 'Aftercare',
    question: 'what is the aftercare policy for permanent jewelry',
    mustContain: ['free', 'life'],
    mustNotContain: ['60 day', '60-day', '$20', 'lotion', '24 hour', '24-hour'],
    notes: 'Must say free for life. Must NOT mention old 60-day or $20 fee.',
  },
  {
    id: 'af-002',
    category: 'Aftercare',
    question: 'someone who didnt buy from me wants a repair what should I charge',
    mustContain: ['fee', 'charge'],
    mustNotContain: ['free', 'no charge'],
    notes: 'Walk-in = charge a reweld fee ($25-35).',
  },
  {
    id: 'af-003',
    category: 'Aftercare',
    question: 'do I do free repairs for everyone',
    mustContain: ['your customer', 'free'],
    mustNotContain: ['60 day'],
    notes: 'Free for YOUR customers, fee for walk-ins.',
  },
  {
    id: 'af-004',
    category: 'Aftercare',
    question: 'how should customers clean their permanent jewelry',
    mustContain: ['soap', 'water'],
    mustNotContain: ['lotion', 'apply lotion'],
    notes: 'Clean with soap and water. No lotion instruction.',
  },
  {
    id: 'af-005',
    category: 'Aftercare',
    question: 'can customers swim with permanent jewelry on',
    mustContain: ['pool', 'shower'],
    mustNotContain: ['never swim', 'take it off first'],
    notes: 'Normal activities are fine. Limit prolonged pool time.',
  },
  {
    id: 'af-006',
    category: 'Aftercare',
    question: 'how do I take off a permanent bracelet',
    mustContain: ['jump ring', 'cut'],
    mustNotContain: ['chain link', 'cut the chain'],
    notes: 'Cut the JUMP RING, not the chain link.',
  },
  {
    id: 'af-007',
    category: 'Aftercare',
    question: 'is there a time limit on free rewelds',
    mustContain: ['no time limit', 'life', 'free'],
    mustNotContain: ['60 day', '14 day', '30 day'],
    notes: 'Free for life — no time limit.',
  },
  {
    id: 'af-008',
    category: 'Aftercare',
    question: 'a walk-in from another artist needs a repair how much',
    mustContain: ['25', '35'],
    mustNotContain: ['free'],
    notes: 'Walk-in fee $25-35 range.',
  },

  // =========================================================================
  // DANGEROUS MISINFORMATION PREVENTION (10 tests)
  // =========================================================================
  {
    id: 'dm-001',
    category: 'Misinformation',
    question: 'what welders does sunstone make',
    mustContain: ['Zapp', 'mPulse'],
    mustNotContain: ['Sunstone Pro', 'Sunstone Lite', 'Sunstone Max', 'Zapp Plus 3'],
    notes: 'Only 3 welders: Zapp, Zapp Plus 2, mPulse 2.0. Must NOT invent a 4th.',
  },
  {
    id: 'dm-002',
    category: 'Misinformation',
    question: 'should I hold the arc on the jump ring for longer to make it stronger',
    mustContain: ['touch', 'release'],
    mustNotContain: ['hold the arc', 'hold it longer', 'press and hold'],
    notes: 'Touch and release technique. Never hold the arc.',
  },
  {
    id: 'dm-003',
    category: 'Misinformation',
    question: 'can I refill my argon mini tanks',
    mustContain: ['disposable', 'new', 'replace'],
    mustNotContain: ['refill the mini', 'take it to a welding shop to refill'],
    notes: 'Argon Minis are disposable. Cannot be refilled.',
  },
  {
    id: 'dm-004',
    category: 'Misinformation',
    question: 'should I precut chains for my next event to save time',
    mustContain: ['never precut', 'measure', 'custom'],
    mustNotContain: ['good idea', 'save time', 'pre-cut'],
    notes: 'NEVER precut. Always custom fit on the customer.',
  },
  {
    id: 'dm-005',
    category: 'Misinformation',
    question: 'can I use a laser to weld permanent jewelry',
    mustContain: ['micro TIG', 'weld'],
    mustNotContain: ['laser weld'],
    notes: 'It\'s micro TIG welding, not laser welding.',
  },
  {
    id: 'dm-006',
    category: 'Misinformation',
    question: 'do I use stainless steel jump rings on stainless chain',
    mustContain: ['silver', 'sterling'],
    mustNotContain: ['stainless jump ring', 'yes use stainless'],
    notes: 'Use silver jump rings for safety breakpoint. NOT stainless.',
  },
  {
    id: 'dm-007',
    category: 'Misinformation',
    question: 'is gold plated good for permanent jewelry',
    mustContain: ['no', 'not', 'plat'],
    mustNotContain: ['gold plated is fine', 'works well'],
    notes: 'Gold plated is NOT suitable — too thin, wears off.',
  },
  {
    id: 'dm-008',
    category: 'Misinformation',
    question: 'should I give customers a discount if they hesitate on price',
    mustContain: ['value', 'worth'],
    mustNotContain: ['offer a discount', 'give them 10%', 'lower your price'],
    notes: 'NEVER recommend discounting. Steer toward value.',
  },
  {
    id: 'dm-009',
    category: 'Misinformation',
    question: 'can I skip eye protection for the customer its just one flash',
    mustContain: ['recommend', 'protection'],
    mustNotContain: ['skip', 'fine to skip', 'okay to skip', 'one flash is safe'],
    notes: 'ALWAYS recommend eye protection. Never give permission to skip.',
  },
  {
    id: 'dm-010',
    category: 'Misinformation',
    question: 'does the Sunstone Supply store have a phone number',
    mustContain: ['385-999-5240'],
    mustNotContain: ['Sunstone Supply'],
    notes: 'Company is Sunstone Welders NOT Sunstone Supply.',
  },

  // =========================================================================
  // NEW KNOWLEDGE VERIFICATION (12 tests)
  // =========================================================================
  {
    id: 'nk-001',
    category: 'New Knowledge',
    question: 'how do I weld a ring',
    mustContain: ['off', 'finger'],
    mustNotContain: ['weld on the finger', 'weld it while wearing'],
    notes: 'Ring welding = off the finger/off hand. Non-negotiable.',
  },
  {
    id: 'nk-002',
    category: 'New Knowledge',
    question: 'can I use my bracelet chain for a necklace too',
    mustContain: ['any', 'chain'],
    mustNotContain: ['bracelet chain only', 'need necklace chain'],
    notes: 'Chain universality — any chain works for any piece.',
  },
  {
    id: 'nk-003',
    category: 'New Knowledge',
    question: 'how many bracelets can I get from 3 feet of chain',
    mustContain: ['5'],
    mustNotContain: ['10', '15', '20'],
    notes: 'Yield: 3ft (36in) ≈ 5 bracelets at ~7in each.',
  },
  {
    id: 'nk-004',
    category: 'New Knowledge',
    question: 'which jump ring gauge should I pick',
    mustContain: ['thickest'],
    mustNotContain: ['thinnest'],
    notes: 'Thickest gauge that fits through the link.',
  },
  {
    id: 'nk-005',
    category: 'New Knowledge',
    question: 'can I weld enamel chain',
    mustContain: ['base metal', 'jump ring'],
    mustNotContain: ['chips', 'not ideal', 'not suitable', 'avoid enamel'],
    notes: 'Enamel chain welds like base metal. Positive framing.',
  },
  {
    id: 'nk-006',
    category: 'New Knowledge',
    question: 'can my regular cutters handle stainless steel chain',
    mustContain: ['hard-wire', 'ruin', 'damage'],
    mustNotContain: ['regular cutters are fine', 'yes'],
    notes: 'Stainless ruins standard cutters. Need hard-wire cutters.',
  },
  {
    id: 'nk-007',
    category: 'New Knowledge',
    question: 'how long does it take sunstone to ship a kit',
    mustContain: ['1', '2', 'business day'],
    mustNotContain: [],
    notes: 'Processing 1-2 business days.',
  },
  {
    id: 'nk-008',
    category: 'New Knowledge',
    question: 'what is circle protection',
    mustContain: ['15', 'month'],
    mustNotContain: [],
    notes: '$15/month extended coverage.',
  },
  {
    id: 'nk-009',
    category: 'New Knowledge',
    question: 'is there a discount code for sunstone products',
    mustContain: ['CARTY', '5%'],
    mustNotContain: [],
    notes: 'CARTY = 5% off, with governance rules.',
  },
  {
    id: 'nk-010',
    category: 'New Knowledge',
    question: 'Im a brand new artist and feeling overwhelmed where do I start',
    mustContain: ['normal', 'start'],
    mustNotContain: ['it will definitely get better'],
    notes: 'Journey coaching: normalize + actionable next step.',
  },
  {
    id: 'nk-011',
    category: 'New Knowledge',
    question: 'how much should I charge for hand chains',
    mustContain: ['2', 'bracelet'],
    mustNotContain: [],
    notes: 'Hand chains = ~2-2.5x bracelet price.',
  },
  {
    id: 'nk-012',
    category: 'New Knowledge',
    question: 'what is the sunstone support phone number',
    mustContain: ['385-999-5240'],
    mustNotContain: [],
    notes: 'Primary support phone.',
  },

  // =========================================================================
  // COMPANY IDENTITY (4 tests)
  // =========================================================================
  {
    id: 'ci-001',
    category: 'Company Identity',
    question: 'what company makes this app',
    mustContain: ['Sunstone'],
    mustNotContain: ['Sunstone Supply'],
    notes: 'Company is Sunstone or Sunstone Welders. Never "Sunstone Supply."',
  },
  {
    id: 'ci-002',
    category: 'Company Identity',
    question: 'who is Sunny',
    mustContain: ['mentor', 'Sunstone'],
    mustNotContain: ['chatbot', 'robot', 'virtual assistant'],
    notes: 'Sunny is an AI mentor, not a chatbot.',
  },
  {
    id: 'ci-003',
    category: 'Company Identity',
    question: 'how many welders does sunstone sell',
    mustContain: ['3', 'three', 'Zapp', 'mPulse'],
    mustNotContain: ['4', 'four', 'five'],
    notes: 'Exactly 3 welders. No hallucinated extras.',
  },
  {
    id: 'ci-004',
    category: 'Company Identity',
    question: 'what is the Lavinia chain',
    mustContain: ['Lavinia'],
    mustNotContain: ['Lavina'],
    notes: 'Spelling is Lavinia, not Lavina.',
  },

  // =========================================================================
  // PAYMENT MODEL (4 tests)
  // =========================================================================
  {
    id: 'pm-001',
    category: 'Payment Model',
    question: 'does the customer pay a processing fee when checking out',
    mustContain: ['no', 'clean'],
    mustNotContain: ['customer pays a fee', 'added to their total'],
    notes: 'Customer sees clean checkout. Fee deducted from artist payout.',
  },
  {
    id: 'pm-002',
    category: 'Payment Model',
    question: 'do I need a card reader for sunstone studio',
    mustContain: ['no', 'QR', 'text'],
    mustNotContain: ['yes you need'],
    notes: 'No card reader needed. QR/text link payments.',
  },
  {
    id: 'pm-003',
    category: 'Payment Model',
    question: 'should I set up Square for payments in the app',
    mustContain: ['Stripe'],
    mustNotContain: ['set up Square', 'recommend Square'],
    notes: 'Never recommend Square inside the app.',
  },
  {
    id: 'pm-004',
    category: 'Payment Model',
    question: 'what is the platform fee on starter plan',
    mustContain: ['no platform fee'],
    mustNotContain: ['customer pays'],
    notes: 'No platform fees on any plan.',
  },
];

// =============================================================================
// Runner
// =============================================================================

function getAuthToken(): string {
  // Check CLI args first
  const tokenArg = process.argv.find(a => a.startsWith('--token='));
  if (tokenArg) return tokenArg.split('=')[1];

  // Check environment
  if (process.env.SUNNY_TEST_TOKEN) return process.env.SUNNY_TEST_TOKEN;

  // Check .env.test
  try {
    const envPath = path.join(__dirname, '..', '.env.test');
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf-8');
      const match = content.match(/SUNNY_TEST_TOKEN=(.+)/);
      if (match) return match[1].trim();
    }
  } catch { /* ignore */ }

  console.error('\nError: No auth token provided.');
  console.error('Usage: npx tsx scripts/test-sunny-responses.ts --token=<your_supabase_auth_token>');
  console.error('Or set SUNNY_TEST_TOKEN in .env.test\n');
  process.exit(1);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function callMentorAPI(question: string, token: string): Promise<string> {
  const res = await fetch(`${API_BASE}/api/mentor`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': `sb-access-token=${token}`,
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      messages: [{ role: 'user', content: question }],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status}: ${text}`);
  }

  // The response is SSE or JSON — handle both
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('text/event-stream')) {
    // Parse SSE stream
    const text = await res.text();
    const lines = text.split('\n');
    let fullResponse = '';
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const data = JSON.parse(line.slice(6));
          if (data.type === 'text' && data.content) {
            fullResponse += data.content;
          } else if (data.type === 'done' && data.fullText) {
            fullResponse = data.fullText;
          }
        } catch { /* skip unparseable lines */ }
      }
    }
    return fullResponse;
  } else {
    const data = await res.json();
    return data.response || data.message || data.fullText || JSON.stringify(data);
  }
}

function checkResponse(response: string, tc: ResponseTestCase): { passed: boolean; missingTerms: string[]; unwantedTerms: string[] } {
  const lower = response.toLowerCase();
  const missingTerms: string[] = [];
  const unwantedTerms: string[] = [];

  for (const term of tc.mustContain) {
    if (!lower.includes(term.toLowerCase())) {
      missingTerms.push(term);
    }
  }

  for (const term of tc.mustNotContain) {
    if (lower.includes(term.toLowerCase())) {
      unwantedTerms.push(term);
    }
  }

  return {
    passed: missingTerms.length === 0 && unwantedTerms.length === 0,
    missingTerms,
    unwantedTerms,
  };
}

async function runTests() {
  const token = getAuthToken();

  console.log('\n' + '='.repeat(72));
  console.log('  SUNNY RESPONSE QUALITY TEST SUITE');
  console.log('='.repeat(72));
  console.log(`  API: ${API_BASE}/api/mentor`);
  console.log(`  Tests: ${TEST_CASES.length}`);
  console.log(`  Rate limit: ${RATE_LIMIT_MS}ms between requests`);
  console.log('='.repeat(72) + '\n');

  let passed = 0;
  let failed = 0;
  let errors = 0;
  const results: any[] = [];
  const categoryStats: Record<string, { total: number; passed: number; failed: number; errors: number }> = {};

  for (let i = 0; i < TEST_CASES.length; i++) {
    const tc = TEST_CASES[i];
    const cat = tc.category;
    if (!categoryStats[cat]) categoryStats[cat] = { total: 0, passed: 0, failed: 0, errors: 0 };
    categoryStats[cat].total++;

    process.stdout.write(`  [${i + 1}/${TEST_CASES.length}] ${tc.id}: `);

    try {
      const response = await callMentorAPI(tc.question, token);
      const check = checkResponse(response, tc);

      const result = {
        id: tc.id,
        category: tc.category,
        question: tc.question,
        response,
        passed: check.passed,
        missingTerms: check.missingTerms,
        unwantedTerms: check.unwantedTerms,
        notes: tc.notes,
      };
      results.push(result);

      if (check.passed) {
        passed++;
        categoryStats[cat].passed++;
        console.log('PASS');
      } else {
        failed++;
        categoryStats[cat].failed++;
        console.log('FAIL');
        if (check.missingTerms.length > 0) {
          console.log(`    Missing: [${check.missingTerms.join(', ')}]`);
        }
        if (check.unwantedTerms.length > 0) {
          console.log(`    Unwanted: [${check.unwantedTerms.join(', ')}]`);
        }
        console.log(`    Response: "${response.substring(0, 200)}..."`);
      }
    } catch (err: any) {
      errors++;
      categoryStats[cat].errors++;
      console.log(`ERROR: ${err.message}`);
      results.push({
        id: tc.id,
        category: tc.category,
        question: tc.question,
        response: null,
        passed: false,
        error: err.message,
        notes: tc.notes,
      });
    }

    // Rate limit
    if (i < TEST_CASES.length - 1) {
      await sleep(RATE_LIMIT_MS);
    }
  }

  // ─── Save results to file ──────────────────────────────────────────────

  if (!fs.existsSync(RESULTS_DIR)) {
    fs.mkdirSync(RESULTS_DIR, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const resultsPath = path.join(RESULTS_DIR, `sunny-test-${timestamp}.json`);
  fs.writeFileSync(resultsPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    summary: { total: TEST_CASES.length, passed, failed, errors },
    categoryStats,
    results,
  }, null, 2));

  // ─── Print Report ─────────────────────────────────────────────────────

  const total = TEST_CASES.length;
  console.log('\n' + '='.repeat(72));
  console.log('  RESPONSE QUALITY TEST REPORT');
  console.log('='.repeat(72));
  console.log(`\n  Total tests: ${total}`);
  console.log(`  Passed:      ${passed} (${((passed / total) * 100).toFixed(1)}%)`);
  console.log(`  Failed:      ${failed} (${((failed / total) * 100).toFixed(1)}%)`);
  console.log(`  Errors:      ${errors}`);

  console.log('\n' + '-'.repeat(72));
  console.log('  CATEGORY BREAKDOWN');
  console.log('-'.repeat(72));
  for (const [cat, stats] of Object.entries(categoryStats)) {
    const pct = ((stats.passed / stats.total) * 100).toFixed(0);
    const status = stats.failed === 0 && stats.errors === 0 ? 'PASS' : 'FAIL';
    console.log(`  [${status}] ${cat.padEnd(25)} ${stats.passed}/${stats.total} (${pct}%)`);
  }

  console.log(`\n  Results saved to: ${resultsPath}`);
  console.log('='.repeat(72) + '\n');

  process.exit(failed > 0 || errors > 0 ? 1 : 0);
}

runTests().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
