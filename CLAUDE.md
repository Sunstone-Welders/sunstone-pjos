# Sunstone PJOS

Multi-tenant SaaS platform for permanent jewelry artists.
Next.js 15 (App Router), TypeScript, Supabase, Tailwind CSS, Vercel.

## Commands

- `npm run dev` — Start development server
- `npm run build` — Build for production (ALWAYS run before pushing)
- `npx supabase gen types typescript --project-id <id> > src/types/supabase.ts` — Regenerate DB types

## Architecture

- `/src/app/` — Next.js App Router pages and API routes
- `/src/components/ui/` — Reusable design system components (Button, Card, Input, etc.)
- `/src/components/` — Feature components (MentorChat, CartPanel, AdminAIChat, etc.)
- `/src/lib/` — Utilities, Supabase clients, subscription logic, permissions
- `/src/hooks/` — React hooks (use-tenant, use-cart)
- `/src/types/` — TypeScript type definitions

## Critical Rules

- NEVER change the Supabase client imports — they are correct as-is
- NEVER remove the Sunstone logo fix in the settings page
- NEVER remove the dollar sign fix in financial displays
- NEVER use font-mono anywhere in the app
- ALWAYS use the existing component library from @/components/ui/
- Touch targets must be 48px minimum — this is a tablet POS
- Design: Light mode luxury, "calm confidence" aesthetic
- When editing a file, preserve ALL existing functionality — only add/change what's needed

## Design System

- Fonts: Inter (sans), Fraunces (display), JetBrains Mono (mono)
- Colors: CSS custom properties (--surface-base, --accent-500, etc.)
- See DESIGN_SYSTEM.md for full reference

## Multi-Tenant

- All data is tenant-scoped via tenant_id
- Row-Level Security (RLS) on all tables
- createClient() for browser, createServerSupabase() for server, createServiceRoleClient() to bypass RLS
- useTenant() hook provides tenant context in React components

## Known Fixes to Preserve

- Settings page: Sunstone supplier logo display fix
- Financial reports: Revenue = subtotal + tax + tip (not total which includes fees)
- Cart: platform_fee_percent read from tenant record
- Subscription: trial_ends_at check for expired trials → defaults to starter

<!-- VERCEL BEST PRACTICES START -->
## Best practices for developing on Vercel

These defaults are optimized for AI coding agents (and humans) working on apps that deploy to Vercel.

- Treat Vercel Functions as stateless + ephemeral (no durable RAM/FS, no background daemons), use Blob or marketplace integrations for preserving state
- Edge Functions (standalone) are deprecated; prefer Vercel Functions
- Don't start new projects on Vercel KV/Postgres (both discontinued); use Marketplace Redis/Postgres instead
- Store secrets in Vercel Env Variables; not in git or `NEXT_PUBLIC_*`
- Provision Marketplace native integrations with `vercel integration add` (CI/agent-friendly)
- Sync env + project settings with `vercel env pull` / `vercel pull` when you need local/offline parity
- Use `waitUntil` for post-response work; avoid the deprecated Function `context` parameter
- Set Function regions near your primary data source; avoid cross-region DB/service roundtrips
- Tune Fluid Compute knobs (e.g., `maxDuration`, memory/CPU) for long I/O-heavy calls (LLMs, APIs)
- Use Runtime Cache for fast **regional** caching + tag invalidation (don't treat it as global KV)
- Use Cron Jobs for schedules; cron runs in UTC and triggers your production URL via HTTP GET
- Use Vercel Blob for uploads/media; Use Edge Config for small, globally-read config
- If Enable Deployment Protection is enabled, use a bypass secret to directly access them
- Add OpenTelemetry via `@vercel/otel` on Node; don't expect OTEL support on the Edge runtime
- Enable Web Analytics + Speed Insights early
- Use AI Gateway for model routing, set AI_GATEWAY_API_KEY, using a model string (e.g. 'anthropic/claude-sonnet-4.6'), Gateway is already default in AI SDK
  needed. Always curl https://ai-gateway.vercel.sh/v1/models first; never trust model IDs from memory
- For durable agent loops or untrusted code: use Workflow (pause/resume/state) + Sandbox; use Vercel MCP for secure infra access
<!-- VERCEL BEST PRACTICES END -->
