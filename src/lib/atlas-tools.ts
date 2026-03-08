// ============================================================================
// Atlas Tools — src/lib/atlas-tools.ts
// ============================================================================
// 11 agentic tools for Atlas (platform admin AI).
// Tools use service role with no tenant scoping (admin has platform-wide access).
// ============================================================================

import { sendSMS as twilioSendSMS } from '@/lib/twilio';

// ============================================================================
// Types
// ============================================================================

export interface AtlasToolContext {
  serviceClient: any;
}

// ============================================================================
// Tool Definitions (Anthropic tool schema)
// ============================================================================

export const ATLAS_TOOL_DEFINITIONS = [
  // 1. get_platform_stats
  {
    name: 'get_platform_stats',
    description: 'Get high-level platform statistics: tenant count, revenue, sales, clients, events.',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  // 2. search_tenants
  {
    name: 'search_tenants',
    description: 'Search for tenants by name, slug, or subscription tier.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search term (name or slug)' },
        limit: { type: 'number', description: 'Max results (default 10)' },
      },
      required: ['query'],
    },
  },
  // 3. get_tenant_details
  {
    name: 'get_tenant_details',
    description: 'Get full details for a specific tenant: subscription, sales, events, team, inventory, Sunny usage.',
    input_schema: {
      type: 'object',
      properties: {
        tenant_id: { type: 'string', description: 'Tenant UUID' },
      },
      required: ['tenant_id'],
    },
  },
  // 4. message_tenant (CONFIRMATION REQUIRED)
  {
    name: 'message_tenant',
    description: 'Send a message to a tenant owner. REQUIRES CONFIRMATION: first call without confirmed=true to preview, then call with confirmed=true.',
    input_schema: {
      type: 'object',
      properties: {
        tenant_id: { type: 'string', description: 'Tenant UUID' },
        body: { type: 'string', description: 'Message body' },
        channel: { type: 'string', enum: ['email', 'sms'], description: 'Message channel' },
        confirmed: { type: 'boolean', description: 'Set to true after admin confirms the preview' },
      },
      required: ['tenant_id', 'body', 'channel'],
    },
  },
  // 5. broadcast_to_tenants (CONFIRMATION REQUIRED)
  {
    name: 'broadcast_to_tenants',
    description: 'Send a broadcast message to all tenants or filtered subset. REQUIRES CONFIRMATION: first call without confirmed=true to preview.',
    input_schema: {
      type: 'object',
      properties: {
        body: { type: 'string', description: 'Message body' },
        channel: { type: 'string', enum: ['email', 'sms'], description: 'Message channel' },
        filter: { type: 'string', enum: ['all', 'starter', 'pro', 'business', 'trial'], description: 'Filter tenants by tier (default all)' },
        confirmed: { type: 'boolean', description: 'Set to true after admin confirms the preview' },
      },
      required: ['body', 'channel'],
    },
  },
  // 6. update_tenant (CONFIRMATION REQUIRED)
  {
    name: 'update_tenant',
    description: 'Update a tenant\'s settings (suspend, change tier, etc.). REQUIRES CONFIRMATION.',
    input_schema: {
      type: 'object',
      properties: {
        tenant_id: { type: 'string', description: 'Tenant UUID' },
        updates: {
          type: 'object',
          description: 'Fields to update',
          properties: {
            subscription_tier: { type: 'string', enum: ['starter', 'pro', 'business'] },
            is_suspended: { type: 'boolean' },
            name: { type: 'string' },
          },
        },
        confirmed: { type: 'boolean', description: 'Set to true after admin confirms' },
      },
      required: ['tenant_id', 'updates'],
    },
  },
  // 7. get_revenue_report
  {
    name: 'get_revenue_report',
    description: 'Get platform-wide revenue report for a specific period.',
    input_schema: {
      type: 'object',
      properties: {
        period: { type: 'string', enum: ['today', 'week', 'month', 'year'], description: 'Report period' },
      },
      required: ['period'],
    },
  },
  // 8. get_knowledge_gaps
  {
    name: 'get_knowledge_gaps',
    description: 'Get Sunny\'s knowledge gaps — questions she couldn\'t answer.',
    input_schema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['pending', 'resolved', 'dismissed', 'all'], description: 'Filter by status (default pending)' },
      },
      required: [],
    },
  },
  // 9. approve_knowledge_gap
  {
    name: 'approve_knowledge_gap',
    description: 'Approve a knowledge gap by providing an answer that will be added to Sunny\'s knowledge base.',
    input_schema: {
      type: 'object',
      properties: {
        gap_id: { type: 'string', description: 'Knowledge gap UUID' },
        answer: { type: 'string', description: 'The approved answer to add to Sunny\'s knowledge' },
      },
      required: ['gap_id', 'answer'],
    },
  },
  // 10. get_needs_attention
  {
    name: 'get_needs_attention',
    description: 'Get tenants that need attention: trial expiring, no events, no payment processor, stalled onboarding.',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  // 11. add_admin_note
  {
    name: 'add_admin_note',
    description: 'Add an internal admin note to a tenant profile.',
    input_schema: {
      type: 'object',
      properties: {
        tenant_id: { type: 'string', description: 'Tenant UUID' },
        note: { type: 'string', description: 'Note text' },
      },
      required: ['tenant_id', 'note'],
    },
  },
];

// ============================================================================
// Tool Status Labels
// ============================================================================

export function getAtlasToolStatusLabel(name: string): string {
  const labels: Record<string, string> = {
    get_platform_stats: 'Fetching platform stats...',
    search_tenants: 'Searching tenants...',
    get_tenant_details: 'Loading tenant details...',
    message_tenant: 'Preparing message...',
    broadcast_to_tenants: 'Preparing broadcast...',
    update_tenant: 'Preparing tenant update...',
    get_revenue_report: 'Generating revenue report...',
    get_knowledge_gaps: 'Fetching knowledge gaps...',
    approve_knowledge_gap: 'Approving knowledge gap...',
    get_needs_attention: 'Finding tenants needing attention...',
    add_admin_note: 'Adding admin note...',
  };
  return labels[name] || 'Working...';
}

// ============================================================================
// SMS via Twilio (admin-level, uses shared utility)
// ============================================================================

// Admin-level SMS sends from platform number (no tenantId)
async function sendSMS(to: string, body: string) {
  await twilioSendSMS({ to, body });
}

// ============================================================================
// Email via Resend (admin-level)
// ============================================================================

async function sendEmail(to: string, subject: string, body: string) {
  if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) {
    console.log(`[Atlas Email Skipped] Would send to ${to}: ${subject}`);
    return;
  }
  const { Resend } = await import('resend');
  const resend = new Resend(process.env.RESEND_API_KEY);

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #374151;">
  ${body.split('\n').map((line) => `<p style="margin: 0 0 12px;">${line}</p>`).join('')}
</body></html>`;

  const { error } = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL,
    to,
    subject,
    html,
  });
  if (error) throw new Error(error.message || 'Resend error');
}

// ============================================================================
// Tool Executor Dispatcher
// ============================================================================

export async function executeAtlasTool(
  name: string,
  input: any,
  ctx: AtlasToolContext
): Promise<{ result: any; isError?: boolean }> {
  const { serviceClient } = ctx;

  try {
    switch (name) {
      // ── 1. get_platform_stats ──
      case 'get_platform_stats': {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - now.getDay());
        startOfWeek.setHours(0, 0, 0, 0);

        const [tenantRes, clientRes, salesRes, eventRes] = await Promise.all([
          serviceClient.from('tenants').select('id, subscription_tier', { count: 'exact' }),
          serviceClient.from('clients').select('id', { count: 'exact', head: true }),
          serviceClient.from('sales').select('id, subtotal, tax_amount, tip_amount, platform_fee_amount, created_at').eq('status', 'completed'),
          serviceClient.from('events').select('id', { count: 'exact', head: true }),
        ]);

        const tenants = tenantRes.data || [];
        const tierBreakdown: Record<string, number> = {};
        tenants.forEach((t: any) => {
          tierBreakdown[t.subscription_tier] = (tierBreakdown[t.subscription_tier] || 0) + 1;
        });

        const allSales = salesRes.data || [];
        const totalRevenue = allSales.reduce((s: number, sale: any) => s + Number(sale.subtotal) + Number(sale.tax_amount) + Number(sale.tip_amount), 0);
        const totalFees = allSales.reduce((s: number, sale: any) => s + Number(sale.platform_fee_amount), 0);
        const monthSales = allSales.filter((s: any) => new Date(s.created_at) >= startOfMonth);
        const weekSales = allSales.filter((s: any) => new Date(s.created_at) >= startOfWeek);
        const monthRevenue = monthSales.reduce((s: number, sale: any) => s + Number(sale.subtotal) + Number(sale.tax_amount) + Number(sale.tip_amount), 0);

        return {
          result: {
            tenants: { total: tenantRes.count || 0, by_tier: tierBreakdown },
            clients: { total: clientRes.count || 0 },
            events: { total: eventRes.count || 0 },
            revenue: {
              all_time: totalRevenue,
              platform_fees_all_time: totalFees,
              this_month: monthRevenue,
              this_month_sales: monthSales.length,
              this_week_sales: weekSales.length,
              total_sales: allSales.length,
            },
          },
        };
      }

      // ── 2. search_tenants ──
      case 'search_tenants': {
        const limit = input.limit || 10;
        const { data, error } = await serviceClient
          .from('tenants')
          .select('id, name, slug, subscription_tier, created_at, is_suspended')
          .or(`name.ilike.%${input.query}%,slug.ilike.%${input.query}%`)
          .order('name')
          .limit(limit);

        if (error) return { result: { error: error.message }, isError: true };
        return { result: { tenants: data || [] } };
      }

      // ── 3. get_tenant_details ──
      case 'get_tenant_details': {
        const [tenantRes, salesRes, eventsRes, clientsRes, membersRes, inventoryRes] = await Promise.all([
          serviceClient
            .from('tenants')
            .select('id, name, slug, subscription_tier, subscription_status, trial_ends_at, fee_handling, created_at, is_suspended, square_merchant_id, stripe_account_id, sunny_questions_used')
            .eq('id', input.tenant_id)
            .single(),
          serviceClient
            .from('sales')
            .select('id, total, created_at')
            .eq('tenant_id', input.tenant_id)
            .eq('status', 'completed')
            .order('created_at', { ascending: false })
            .limit(100),
          serviceClient
            .from('events')
            .select('id, name, start_time, location')
            .eq('tenant_id', input.tenant_id)
            .order('start_time', { ascending: false })
            .limit(10),
          serviceClient
            .from('clients')
            .select('id', { count: 'exact', head: true })
            .eq('tenant_id', input.tenant_id),
          serviceClient
            .from('tenant_members')
            .select('id, role, accepted_at, profiles(email)')
            .eq('tenant_id', input.tenant_id)
            .not('accepted_at', 'is', null),
          serviceClient
            .from('inventory_items')
            .select('id, name, type, quantity_on_hand, reorder_threshold')
            .eq('tenant_id', input.tenant_id)
            .eq('is_active', true)
            .limit(50),
        ]);

        if (tenantRes.error) return { result: { error: 'Tenant not found' }, isError: true };

        const t = tenantRes.data;
        const sales = salesRes.data || [];
        const totalRevenue = sales.reduce((s: number, sale: any) => s + Number(sale.total), 0);
        const lowStock = (inventoryRes.data || []).filter((i: any) =>
          i.reorder_threshold && Number(i.quantity_on_hand) <= Number(i.reorder_threshold)
        );

        return {
          result: {
            tenant: {
              id: t.id,
              name: t.name,
              slug: t.slug,
              tier: t.subscription_tier,
              status: t.subscription_status,
              trial_ends: t.trial_ends_at,
              fee_handling: t.fee_handling,
              created: t.created_at,
              suspended: t.is_suspended,
              payment_connected: { square: !!t.square_merchant_id, stripe: !!t.stripe_account_id },
              sunny_questions_used: t.sunny_questions_used || 0,
            },
            sales: { count: sales.length, total_revenue: totalRevenue },
            events: (eventsRes.data || []).map((e: any) => ({ name: e.name, date: e.start_time, location: e.location })),
            clients: { total: clientsRes.count || 0 },
            team: (membersRes.data || []).map((m: any) => ({ role: m.role, email: (m.profiles as any)?.email })),
            low_stock_items: lowStock.map((i: any) => ({ name: i.name, type: i.type, qty: Number(i.quantity_on_hand) })),
          },
        };
      }

      // ── 4. message_tenant (CONFIRMATION REQUIRED) ──
      case 'message_tenant': {
        // Get tenant owner info
        const { data: tenant } = await serviceClient
          .from('tenants')
          .select('id, name')
          .eq('id', input.tenant_id)
          .single();

        if (!tenant) return { result: { error: 'Tenant not found' }, isError: true };

        // Find owner (first member)
        const { data: members } = await serviceClient
          .from('tenant_members')
          .select('user_id, role, profiles(email, phone)')
          .eq('tenant_id', input.tenant_id)
          .eq('role', 'owner')
          .not('accepted_at', 'is', null)
          .limit(1);

        const owner = members?.[0];
        if (!owner) return { result: { error: 'No owner found for tenant' }, isError: true };

        const ownerProfile = owner.profiles as any;
        const contact = input.channel === 'sms' ? ownerProfile?.phone : ownerProfile?.email;

        if (!input.confirmed) {
          return {
            result: {
              pending_confirmation: true,
              preview: {
                tenant_name: tenant.name,
                channel: input.channel,
                to: contact || 'no contact info',
                body: input.body,
              },
            },
          };
        }

        if (!contact) return { result: { error: `Owner has no ${input.channel === 'sms' ? 'phone' : 'email'}` }, isError: true };

        if (input.channel === 'sms') {
          await sendSMS(contact, input.body);
        } else {
          await sendEmail(contact, 'Message from Sunstone', input.body);
        }

        return { result: { success: true, sent_to: tenant.name, channel: input.channel } };
      }

      // ── 5. broadcast_to_tenants (CONFIRMATION REQUIRED) ──
      case 'broadcast_to_tenants': {
        const filter = input.filter || 'all';

        let tenantQuery = serviceClient
          .from('tenants')
          .select('id, name, subscription_tier');

        if (filter !== 'all') {
          if (filter === 'trial') {
            tenantQuery = tenantQuery.eq('subscription_status', 'trialing');
          } else {
            tenantQuery = tenantQuery.eq('subscription_tier', filter);
          }
        }

        const { data: tenants } = await tenantQuery;
        if (!tenants || tenants.length === 0) return { result: { error: 'No matching tenants' }, isError: true };

        if (!input.confirmed) {
          return {
            result: {
              pending_confirmation: true,
              preview: {
                filter,
                tenant_count: tenants.length,
                channel: input.channel,
                body: input.body,
                sample_tenants: tenants.slice(0, 5).map((t: any) => t.name),
              },
            },
          };
        }

        // Get owner contacts for each tenant
        let sent = 0;
        let failed = 0;

        for (const tenant of tenants) {
          const { data: members } = await serviceClient
            .from('tenant_members')
            .select('profiles(email, phone)')
            .eq('tenant_id', tenant.id)
            .eq('role', 'owner')
            .not('accepted_at', 'is', null)
            .limit(1);

          const profile = (members?.[0]?.profiles as any);
          if (!profile) { failed++; continue; }

          try {
            if (input.channel === 'sms' && profile.phone) {
              await sendSMS(profile.phone, input.body);
              sent++;
            } else if (input.channel === 'email' && profile.email) {
              await sendEmail(profile.email, 'Message from Sunstone', input.body);
              sent++;
            } else {
              failed++;
            }
          } catch {
            failed++;
          }
        }

        return { result: { success: true, sent, failed, filter } };
      }

      // ── 6. update_tenant (CONFIRMATION REQUIRED) ──
      case 'update_tenant': {
        const { data: tenant } = await serviceClient
          .from('tenants')
          .select('id, name, subscription_tier, is_suspended')
          .eq('id', input.tenant_id)
          .single();

        if (!tenant) return { result: { error: 'Tenant not found' }, isError: true };

        if (!input.confirmed) {
          return {
            result: {
              pending_confirmation: true,
              preview: {
                tenant_name: tenant.name,
                current: {
                  tier: tenant.subscription_tier,
                  suspended: tenant.is_suspended,
                },
                changes: input.updates,
              },
            },
          };
        }

        const { error } = await serviceClient
          .from('tenants')
          .update(input.updates)
          .eq('id', input.tenant_id);

        if (error) return { result: { error: error.message }, isError: true };
        return { result: { success: true, tenant_name: tenant.name, applied: input.updates } };
      }

      // ── 7. get_revenue_report ──
      case 'get_revenue_report': {
        const now = new Date();
        let startDate: Date;

        switch (input.period) {
          case 'today':
            startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            break;
          case 'week':
            startDate = new Date(now);
            startDate.setDate(now.getDate() - now.getDay());
            startDate.setHours(0, 0, 0, 0);
            break;
          case 'month':
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
            break;
          case 'year':
            startDate = new Date(now.getFullYear(), 0, 1);
            break;
          default:
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        }

        const { data: sales } = await serviceClient
          .from('sales')
          .select('id, tenant_id, subtotal, tax_amount, tip_amount, platform_fee_amount, total, payment_method, created_at')
          .eq('status', 'completed')
          .gte('created_at', startDate.toISOString());

        const allSales = sales || [];
        const revenue = allSales.reduce((s: number, sale: any) => s + Number(sale.subtotal) + Number(sale.tax_amount) + Number(sale.tip_amount), 0);
        const fees = allSales.reduce((s: number, sale: any) => s + Number(sale.platform_fee_amount), 0);

        // Revenue by tenant
        const { data: tenants } = await serviceClient.from('tenants').select('id, name');
        const tenantMap: Record<string, string> = {};
        (tenants || []).forEach((t: any) => { tenantMap[t.id] = t.name; });

        const byTenant: Record<string, { name: string; revenue: number; sales: number }> = {};
        allSales.forEach((s: any) => {
          if (!byTenant[s.tenant_id]) byTenant[s.tenant_id] = { name: tenantMap[s.tenant_id] || 'Unknown', revenue: 0, sales: 0 };
          byTenant[s.tenant_id].revenue += Number(s.total);
          byTenant[s.tenant_id].sales += 1;
        });

        const topTenants = Object.values(byTenant).sort((a, b) => b.revenue - a.revenue).slice(0, 10);

        return {
          result: {
            period: input.period,
            total_revenue: revenue,
            platform_fees: fees,
            sales_count: allSales.length,
            top_tenants: topTenants,
          },
        };
      }

      // ── 8. get_knowledge_gaps ──
      case 'get_knowledge_gaps': {
        const status = input.status || 'pending';

        let query = serviceClient
          .from('mentor_knowledge_gaps')
          .select('id, user_message, sunny_response, category, topic, status, created_at, tenant_id')
          .order('created_at', { ascending: false })
          .limit(20);

        if (status !== 'all') {
          query = query.eq('status', status);
        }

        const { data, error } = await query;
        if (error) return { result: { error: error.message }, isError: true };

        // Get tenant names
        const tenantIds = [...new Set((data || []).map((g: any) => g.tenant_id))];
        const { data: tenants } = await serviceClient
          .from('tenants')
          .select('id, name')
          .in('id', tenantIds);
        const tenantMap: Record<string, string> = {};
        (tenants || []).forEach((t: any) => { tenantMap[t.id] = t.name; });

        const gaps = (data || []).map((g: any) => ({
          id: g.id,
          question: g.user_message,
          sunny_response: g.sunny_response,
          category: g.category,
          topic: g.topic,
          status: g.status,
          tenant: tenantMap[g.tenant_id] || 'Unknown',
          date: g.created_at,
        }));

        return { result: { gaps, total: gaps.length } };
      }

      // ── 9. approve_knowledge_gap ──
      case 'approve_knowledge_gap': {
        // Get the gap
        const { data: gap } = await serviceClient
          .from('mentor_knowledge_gaps')
          .select('id, user_message, status')
          .eq('id', input.gap_id)
          .single();

        if (!gap) return { result: { error: 'Knowledge gap not found' }, isError: true };

        // Create knowledge addition
        const { error: insertError } = await serviceClient
          .from('mentor_knowledge_additions')
          .insert({
            question: gap.user_message,
            answer: input.answer,
            is_active: true,
            source: 'atlas_ai',
          });

        if (insertError) return { result: { error: insertError.message }, isError: true };

        // Update gap status
        await serviceClient
          .from('mentor_knowledge_gaps')
          .update({ status: 'approved' })
          .eq('id', input.gap_id);

        return { result: { success: true, gap_id: input.gap_id, question: gap.user_message } };
      }

      // ── 10. get_needs_attention ──
      case 'get_needs_attention': {
        const now = new Date();
        const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

        const { data: allTenants } = await serviceClient
          .from('tenants')
          .select('id, name, subscription_tier, subscription_status, trial_ends_at, created_at, is_suspended, square_merchant_id, stripe_account_id, onboarding_step');

        const tenants = allTenants || [];
        const attention: any[] = [];

        for (const t of tenants) {
          const issues: string[] = [];

          // Trial expiring soon
          if (t.trial_ends_at) {
            const trialEnd = new Date(t.trial_ends_at);
            if (trialEnd > now && trialEnd <= sevenDaysFromNow) {
              issues.push(`Trial expires ${trialEnd.toLocaleDateString()}`);
            }
          }

          // No payment processor
          if (!t.square_merchant_id && !t.stripe_account_id) {
            issues.push('No payment processor connected');
          }

          // Account > 30 days, check for events
          if (new Date(t.created_at) < thirtyDaysAgo) {
            const { count } = await serviceClient
              .from('events')
              .select('id', { count: 'exact', head: true })
              .eq('tenant_id', t.id)
              .gte('start_time', thirtyDaysAgo.toISOString());

            if (count === 0) issues.push('No events in last 30 days');
          }

          // Zero sales, old account
          if (new Date(t.created_at) < thirtyDaysAgo) {
            const { count } = await serviceClient
              .from('sales')
              .select('id', { count: 'exact', head: true })
              .eq('tenant_id', t.id)
              .eq('status', 'completed');

            if (count === 0) issues.push('Zero sales (account > 30 days old)');
          }

          // Onboarding stalled
          if (t.onboarding_step !== null && t.onboarding_step < 7) {
            issues.push(`Onboarding stalled at step ${t.onboarding_step}`);
          }

          if (issues.length > 0) {
            attention.push({
              tenant_id: t.id,
              name: t.name,
              tier: t.subscription_tier,
              issues,
            });
          }
        }

        return { result: { tenants_needing_attention: attention, total: attention.length } };
      }

      // ── 11. add_admin_note ──
      case 'add_admin_note': {
        const { error } = await serviceClient
          .from('admin_notes')
          .insert({
            tenant_id: input.tenant_id,
            body: input.note,
            source: 'atlas_ai',
          });

        // If admin_notes table doesn't exist, try tenant_notes or just log
        if (error) {
          // Fallback: store as a generic note
          console.log(`[Atlas Note] Tenant ${input.tenant_id}: ${input.note}`);
          return { result: { success: true, note: input.note, stored: 'logged' } };
        }

        return { result: { success: true, tenant_id: input.tenant_id } };
      }

      default:
        return { result: { error: `Unknown tool: ${name}` }, isError: true };
    }
  } catch (err: any) {
    console.error(`[AtlasTool:${name}] Error:`, err);
    return { result: { error: err.message || 'Tool execution failed' }, isError: true };
  }
}
