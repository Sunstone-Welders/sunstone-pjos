// ============================================================================
// Sunny Tools — src/lib/sunny-tools.ts
// ============================================================================
// 28 agentic tools for Sunny (business mentor AI).
// Each tool receives { serviceClient, tenantId, userId } context.
// ============================================================================

import { renderTemplate } from '@/lib/templates';

// ============================================================================
// Types
// ============================================================================

export interface SunnyToolContext {
  serviceClient: any;
  tenantId: string;
  userId: string;
}

// ============================================================================
// Tool Definitions (Anthropic tool schema)
// ============================================================================

export const SUNNY_TOOL_DEFINITIONS = [
  // 1. check_inventory
  {
    name: 'check_inventory',
    description: 'Check the artist\'s current inventory items. Can filter by search query or product type.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search term to filter by name (optional)' },
        type: { type: 'string', enum: ['chain', 'jump_ring', 'charm', 'connector'], description: 'Filter by product type (optional)' },
      },
      required: [],
    },
  },
  // 2. add_inventory
  {
    name: 'add_inventory',
    description: 'Add a new inventory item to the artist\'s stock. Required fields: name, material, supplier. Also collect cost_per_inch, quantity, and reorder_point before creating. Confirm the full item details with the artist before executing.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Item name (e.g. "Chloe")' },
        type: { type: 'string', enum: ['chain', 'jump_ring', 'charm', 'connector'], description: 'Product type (defaults to "chain" if not specified)' },
        material: { type: 'string', description: 'Material (e.g. "14K Gold Fill", "Sterling Silver")' },
        quantity: { type: 'number', description: 'Starting quantity (in inches for chain, "each" for jump rings/charms/connectors)' },
        unit: { type: 'string', enum: ['ft', 'each', 'in'], description: 'Unit of measurement (defaults to "in" for chain)' },
        cost_per_inch: { type: 'number', description: 'Cost per inch (mapped to cost_per_unit in DB)' },
        cost: { type: 'number', description: 'Cost per unit (legacy — prefer cost_per_inch for chains)' },
        sell_price: { type: 'number', description: 'Sell price per piece (optional)' },
        supplier: { type: 'string', description: 'Supplier/vendor name' },
        reorder_point: { type: 'number', description: 'Reorder threshold — alert when quantity drops to this level' },
        markup: { type: 'number', description: 'Markup multiplier (e.g. 2.5). Auto-calculates product prices from cost × markup × default lengths.' },
        bracelet_price: { type: 'number', description: 'Override flat bracelet price' },
        anklet_price: { type: 'number', description: 'Override flat anklet price' },
        ring_price: { type: 'number', description: 'Override flat ring price' },
        necklace_price_per_inch: { type: 'number', description: 'Override necklace per-inch price' },
      },
      required: ['name', 'material', 'supplier'],
    },
  },
  // 3. update_price
  {
    name: 'update_price',
    description: 'Update the sell price of an inventory item.',
    input_schema: {
      type: 'object',
      properties: {
        item_id: { type: 'string', description: 'Inventory item UUID' },
        sell_price: { type: 'number', description: 'New sell price' },
      },
      required: ['item_id', 'sell_price'],
    },
  },
  // 4. search_clients
  {
    name: 'search_clients',
    description: 'Search the artist\'s client list by name, email, or phone.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search term (name, email, or phone)' },
        limit: { type: 'number', description: 'Max results to return (default 10)' },
      },
      required: ['query'],
    },
  },
  // 5. get_client_details
  {
    name: 'get_client_details',
    description: 'Get full details for a specific client including purchase history, tags, and notes.',
    input_schema: {
      type: 'object',
      properties: {
        client_id: { type: 'string', description: 'Client UUID' },
      },
      required: ['client_id'],
    },
  },
  // 6. tag_client
  {
    name: 'tag_client',
    description: 'Add a tag to a client. Creates the tag if it doesn\'t exist.',
    input_schema: {
      type: 'object',
      properties: {
        client_id: { type: 'string', description: 'Client UUID' },
        tag_name: { type: 'string', description: 'Tag name (e.g. "VIP", "Girls Night")' },
        color: { type: 'string', description: 'Hex color for new tag (optional, default #7A8B8C)' },
      },
      required: ['client_id', 'tag_name'],
    },
  },
  // 7. add_client_note
  {
    name: 'add_client_note',
    description: 'Add a note to a client\'s profile.',
    input_schema: {
      type: 'object',
      properties: {
        client_id: { type: 'string', description: 'Client UUID' },
        note: { type: 'string', description: 'Note text' },
      },
      required: ['client_id', 'note'],
    },
  },
  // 8. send_message (CONFIRMATION REQUIRED)
  {
    name: 'send_message',
    description: 'Send an SMS or email to a specific client. REQUIRES CONFIRMATION: first call without confirmed=true to get a preview, then call again with confirmed=true after user approval.',
    input_schema: {
      type: 'object',
      properties: {
        client_id: { type: 'string', description: 'Client UUID' },
        channel: { type: 'string', enum: ['sms', 'email'], description: 'Message channel' },
        body: { type: 'string', description: 'Message body. Supports {{client_name}}, {{client_first_name}}, {{business_name}} variables.' },
        subject: { type: 'string', description: 'Email subject (required for email)' },
        confirmed: { type: 'boolean', description: 'Set to true after user confirms the preview' },
      },
      required: ['client_id', 'channel', 'body'],
    },
  },
  // 9. send_bulk_message (CONFIRMATION REQUIRED)
  {
    name: 'send_bulk_message',
    description: 'Send a message to all clients with a specific tag. REQUIRES CONFIRMATION: first call without confirmed=true to get a preview, then call again with confirmed=true after user approval.',
    input_schema: {
      type: 'object',
      properties: {
        tag_name: { type: 'string', description: 'Tag name to target (e.g. "VIP")' },
        channel: { type: 'string', enum: ['sms', 'email'], description: 'Message channel' },
        body: { type: 'string', description: 'Message body. Supports template variables.' },
        subject: { type: 'string', description: 'Email subject (required for email)' },
        confirmed: { type: 'boolean', description: 'Set to true after user confirms the preview' },
      },
      required: ['tag_name', 'channel', 'body'],
    },
  },
  // 10. enroll_in_workflow
  {
    name: 'enroll_in_workflow',
    description: 'Enroll a client in an automated workflow (e.g. follow-up sequence).',
    input_schema: {
      type: 'object',
      properties: {
        client_id: { type: 'string', description: 'Client UUID' },
        workflow_id: { type: 'string', description: 'Workflow template UUID' },
      },
      required: ['client_id', 'workflow_id'],
    },
  },
  // 11. create_event
  {
    name: 'create_event',
    description: 'Create a new event for the artist.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Event name' },
        start_time: { type: 'string', description: 'ISO 8601 start time' },
        end_time: { type: 'string', description: 'ISO 8601 end time (optional)' },
        location: { type: 'string', description: 'Event location (optional)' },
        notes: { type: 'string', description: 'Event notes (optional)' },
      },
      required: ['name', 'start_time'],
    },
  },
  // 12. get_event_performance
  {
    name: 'get_event_performance',
    description: 'Get performance data for a specific event (sales, revenue, queue stats).',
    input_schema: {
      type: 'object',
      properties: {
        event_id: { type: 'string', description: 'Event UUID' },
      },
      required: ['event_id'],
    },
  },
  // 13. list_events
  {
    name: 'list_events',
    description: 'List the artist\'s events. Can filter to upcoming only.',
    input_schema: {
      type: 'object',
      properties: {
        upcoming: { type: 'boolean', description: 'Only show future events (default false)' },
        limit: { type: 'number', description: 'Max events to return (default 10)' },
      },
      required: [],
    },
  },
  // 14. get_revenue_report
  {
    name: 'get_revenue_report',
    description: 'Get a revenue report for a specific period.',
    input_schema: {
      type: 'object',
      properties: {
        period: { type: 'string', enum: ['today', 'week', 'month', 'year'], description: 'Report period' },
      },
      required: ['period'],
    },
  },
  // 15. get_top_products
  {
    name: 'get_top_products',
    description: 'Get the top selling products by quantity or revenue.',
    input_schema: {
      type: 'object',
      properties: {
        period: { type: 'string', enum: ['week', 'month', 'year', 'all'], description: 'Time period (default all)' },
        limit: { type: 'number', description: 'Number of products (default 10)' },
      },
      required: [],
    },
  },
  // 16. get_client_stats
  {
    name: 'get_client_stats',
    description: 'Get overall client statistics (total, new this month, top by spend).',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  // 17. update_settings
  {
    name: 'update_settings',
    description: 'Update business settings for the artist.',
    input_schema: {
      type: 'object',
      properties: {
        business_name: { type: 'string', description: 'New business name' },
        phone: { type: 'string', description: 'Business phone number' },
        tax_rate: { type: 'number', description: 'Default tax rate (as percentage, e.g. 8.5)' },
        theme_id: { type: 'string', description: 'Theme identifier' },
      },
      required: [],
    },
  },
  // 18. get_settings
  {
    name: 'get_settings',
    description: 'Get the artist\'s current business settings.',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  // 19. create_tax_profile
  {
    name: 'create_tax_profile',
    description: 'Create a new tax profile for the artist.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Tax profile name (e.g. "Utah Sales Tax")' },
        rate: { type: 'number', description: 'Tax rate as percentage (e.g. 8.5)' },
        is_default: { type: 'boolean', description: 'Set as default tax profile' },
      },
      required: ['name', 'rate'],
    },
  },
  // 20. update_inventory_item
  {
    name: 'update_inventory_item',
    description: 'Update any field on an existing inventory item — cost per inch, sell price, name, material, quantity, reorder point, length, active status. Can update multiple fields at once. Look up by search_name or item_id. ALWAYS confirm before executing.',
    input_schema: {
      type: 'object',
      properties: {
        search_name: { type: 'string', description: 'Chain name to find (e.g. "Lincoln", "Bryce")' },
        item_id: { type: 'string', description: 'Inventory item UUID for direct lookup (skip search)' },
        updates: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Rename the item' },
            cost_per_inch: { type: 'number', description: 'New cost per inch (mapped to cost_per_unit)' },
            sell_price: { type: 'number', description: 'New sell price' },
            current_length_inches: { type: 'number', description: 'Set total inches (replaces, does not add — mapped to quantity_on_hand)' },
            quantity_on_hand: { type: 'number', description: 'Set quantity on hand directly' },
            reorder_point: { type: 'number', description: 'Reorder threshold — alert when quantity drops to this level' },
            material: { type: 'string', description: 'Update material type' },
            supplier: { type: 'string', description: 'Supplier/vendor name' },
            is_active: { type: 'boolean', description: 'Activate or deactivate' },
            bracelet_price: { type: 'number', description: 'Flat sell price for bracelets' },
            anklet_price: { type: 'number', description: 'Flat sell price for anklets' },
            ring_price: { type: 'number', description: 'Flat sell price for rings' },
            necklace_price_per_inch: { type: 'number', description: 'Sell price per inch for necklaces' },
          },
        },
      },
      required: ['updates'],
    },
  },
  // 21. update_client
  {
    name: 'update_client',
    description: 'Update client info — name, email, phone. ALWAYS confirm before executing.',
    input_schema: {
      type: 'object',
      properties: {
        client_id: { type: 'string', description: 'Client UUID (if known)' },
        client_name: { type: 'string', description: 'Search by name if no ID' },
        updates: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'New full name (will be split into first/last)' },
            email: { type: 'string' },
            phone: { type: 'string' },
          },
        },
      },
      required: ['updates'],
    },
  },
  // 22. update_event
  {
    name: 'update_event',
    description: 'Update an existing event — name, date, time, location, type, status. ALWAYS confirm.',
    input_schema: {
      type: 'object',
      properties: {
        event_id: { type: 'string', description: 'Event UUID (if known)' },
        event_name: { type: 'string', description: 'Search by name if no ID' },
        updates: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            start_time: { type: 'string', description: 'ISO 8601 start time' },
            end_time: { type: 'string', description: 'ISO 8601 end time' },
            location: { type: 'string' },
            notes: { type: 'string' },
            booth_fee: { type: 'number' },
          },
        },
      },
      required: ['updates'],
    },
  },
  // 23. delete_event
  {
    name: 'delete_event',
    description: 'Delete or cancel an event. ALWAYS confirm with extra caution — ask "Are you sure?" before executing.',
    input_schema: {
      type: 'object',
      properties: {
        event_id: { type: 'string', description: 'Event UUID (if known)' },
        event_name: { type: 'string', description: 'Search by name if no ID' },
        action: { type: 'string', enum: ['cancel', 'delete'], description: 'Cancel keeps the record, delete removes it' },
      },
      required: ['action'],
    },
  },
  // 24. update_template
  {
    name: 'update_template',
    description: 'Update an existing message template — name, body, subject, channel, category. ALWAYS confirm.',
    input_schema: {
      type: 'object',
      properties: {
        template_name: { type: 'string', description: 'Search by template name' },
        updates: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            body: { type: 'string' },
            subject: { type: 'string' },
            channel: { type: 'string', enum: ['sms', 'email'] },
            category: { type: 'string' },
          },
        },
      },
      required: ['template_name', 'updates'],
    },
  },
  // 25. create_template
  {
    name: 'create_template',
    description: 'Create a new message template. ALWAYS show the full template content and confirm before creating.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        channel: { type: 'string', enum: ['sms', 'email'] },
        category: { type: 'string', description: 'e.g. welcome, aftercare, follow-up, birthday, party, event, re-engagement' },
        subject: { type: 'string', description: 'Email subject (email only)' },
        body: { type: 'string', description: 'Template body text. Can include {{client_name}} and {{business_name}} variables.' },
      },
      required: ['name', 'channel', 'body'],
    },
  },
  // 26. delete_inventory_item
  {
    name: 'delete_inventory_item',
    description: 'Deactivate or permanently delete an inventory item. ALWAYS confirm with extra caution. Call once without confirmed to preview, then again with confirmed: true to execute.',
    input_schema: {
      type: 'object',
      properties: {
        search_name: { type: 'string', description: 'Item name to find' },
        action: { type: 'string', enum: ['deactivate', 'delete'], description: 'Deactivate hides it, delete removes it permanently' },
        confirmed: { type: 'boolean', description: 'Set to true to execute after previewing' },
      },
      required: ['search_name', 'action'],
    },
  },
  // 27. create_workflow
  {
    name: 'create_workflow',
    description: 'Create a new automated workflow with steps. Walk the artist through what trigger and steps they want. ALWAYS confirm the full workflow before creating.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        trigger_type: { type: 'string', enum: ['event_purchase', 'private_party_purchase', 'manual'], description: 'What triggers this workflow' },
        steps: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              delay_hours: { type: 'number', description: 'Hours to wait before sending (0 = immediate)' },
              channel: { type: 'string', enum: ['sms', 'email'] },
              template_name: { type: 'string', description: 'Which template to send' },
              description: { type: 'string' },
            },
          },
        },
      },
      required: ['name', 'trigger_type', 'steps'],
    },
  },
  // 28. update_workflow
  {
    name: 'update_workflow',
    description: 'Update an existing workflow — rename, change steps, activate/deactivate. ALWAYS confirm.',
    input_schema: {
      type: 'object',
      properties: {
        workflow_name: { type: 'string', description: 'Search by workflow name' },
        updates: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            is_active: { type: 'boolean' },
            steps: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  delay_hours: { type: 'number' },
                  channel: { type: 'string', enum: ['sms', 'email'] },
                  template_name: { type: 'string' },
                  description: { type: 'string' },
                },
              },
            },
          },
        },
      },
      required: ['workflow_name', 'updates'],
    },
  },
  // 29. find_sale
  {
    name: 'find_sale',
    description: 'Find a sale by client name, date, amount, or sale ID. Use this before processing a refund.',
    input_schema: {
      type: 'object',
      properties: {
        client_name: { type: 'string', description: 'Client name to search by (partial match)' },
        date: { type: 'string', description: 'Sale date (YYYY-MM-DD) to filter by' },
        amount: { type: 'number', description: 'Sale total to filter by (approximate match)' },
        sale_id: { type: 'string', description: 'Exact sale UUID if known' },
        limit: { type: 'number', description: 'Max results (default 5)' },
      },
      required: [],
    },
  },
  // 30. process_refund
  {
    name: 'process_refund',
    description: 'Process a refund for a sale. ALWAYS show preview first and require confirmation before executing. Supports full and partial refunds for Stripe, Square, and cash payments.',
    input_schema: {
      type: 'object',
      properties: {
        sale_id: { type: 'string', description: 'The sale UUID to refund' },
        amount: { type: 'number', description: 'Refund amount. Omit or set to sale total for full refund.' },
        reason: { type: 'string', description: 'Reason for the refund (max 200 chars)' },
        confirmed: { type: 'boolean', description: 'Set to true only after showing the preview and getting user confirmation' },
      },
      required: ['sale_id'],
    },
  },
  // 31. add_expense
  {
    name: 'add_expense',
    description: 'Log a business expense (booth fee, supplies, travel, etc.).',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Expense name (e.g. "Spring Market Booth Fee")' },
        amount: { type: 'number', description: 'Expense amount in dollars' },
        category: { type: 'string', enum: ['Booth Fee', 'Supplies', 'Chain Restock', 'Travel & Gas', 'Marketing & Advertising', 'Equipment', 'Insurance', 'Software & Subscriptions', 'Education & Training', 'Packaging & Display', 'Other'], description: 'Expense category' },
        date: { type: 'string', description: 'Expense date (YYYY-MM-DD). Defaults to today.' },
        event_id: { type: 'string', description: 'Link to an event UUID (optional)' },
        notes: { type: 'string', description: 'Additional notes (optional)' },
        is_recurring: { type: 'boolean', description: 'Whether this is a recurring expense' },
        recurring_frequency: { type: 'string', enum: ['weekly', 'monthly', 'quarterly', 'yearly'], description: 'Frequency if recurring' },
      },
      required: ['name', 'amount', 'category'],
    },
  },
  // 32. get_expenses
  {
    name: 'get_expenses',
    description: 'Get expenses for a date range, optionally filtered by category or event.',
    input_schema: {
      type: 'object',
      properties: {
        start_date: { type: 'string', description: 'Start date (YYYY-MM-DD). Defaults to 30 days ago.' },
        end_date: { type: 'string', description: 'End date (YYYY-MM-DD). Defaults to today.' },
        category: { type: 'string', description: 'Filter by category (optional)' },
        event_id: { type: 'string', description: 'Filter by event UUID (optional)' },
      },
      required: [],
    },
  },
  // 33. search_sunstone_catalog
  {
    name: 'search_sunstone_catalog',
    description: 'Search the Sunstone product catalog (synced from Shopify). Use this BEFORE answering ANY product question — pricing, recommendations, availability, or specific product lookups. Returns matching products with name, price, type, URL, and variant details. Search by product name, category/type (e.g. "chain", "jump ring", "connector", "charm"), material/metal (e.g. "gold fill", "silver", "rose gold"), or any keyword.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search term — product name, metal type, category, or keyword (e.g. "Chloe", "gold fill chain", "connector", "jump ring")' },
        product_type: { type: 'string', description: 'Filter by Shopify product type (optional)' },
        limit: { type: 'number', description: 'Max results to return (default 10, max 25)' },
      },
      required: ['query'],
    },
  },
];

// ============================================================================
// Tool Status Labels
// ============================================================================

export function getSunnyToolStatusLabel(name: string): string {
  const labels: Record<string, string> = {
    check_inventory: 'Checking inventory...',
    add_inventory: 'Adding to inventory...',
    update_price: 'Updating price...',
    search_clients: 'Searching clients...',
    get_client_details: 'Looking up client...',
    tag_client: 'Tagging client...',
    add_client_note: 'Adding note...',
    send_message: 'Preparing message...',
    send_bulk_message: 'Preparing bulk message...',
    enroll_in_workflow: 'Enrolling in workflow...',
    create_event: 'Creating event...',
    get_event_performance: 'Analyzing event...',
    list_events: 'Fetching events...',
    get_revenue_report: 'Generating report...',
    get_top_products: 'Finding top products...',
    get_client_stats: 'Gathering client stats...',
    update_settings: 'Updating settings...',
    get_settings: 'Fetching settings...',
    create_tax_profile: 'Creating tax profile...',
    update_inventory_item: 'Updating inventory item...',
    update_client: 'Updating client...',
    update_event: 'Updating event...',
    delete_event: 'Processing event...',
    update_template: 'Updating template...',
    create_template: 'Creating template...',
    delete_inventory_item: 'Processing inventory item...',
    create_workflow: 'Creating workflow...',
    update_workflow: 'Updating workflow...',
    find_sale: 'Searching sales...',
    process_refund: 'Processing refund...',
    add_expense: 'Adding expense...',
    get_expenses: 'Fetching expenses...',
    search_sunstone_catalog: 'Searching Sunstone catalog...',
  };
  return labels[name] || 'Working...';
}

// ============================================================================
// SMS via Twilio
// ============================================================================

async function sendSMS(to: string, body: string) {
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
    console.log(`[Sunny SMS Skipped] Would send to ${to}: ${body.slice(0, 50)}`);
    return;
  }
  const twilio = require('twilio');
  const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  await client.messages.create({
    body,
    from: process.env.TWILIO_PHONE_NUMBER,
    to,
  });
}

// ============================================================================
// Email via Resend
// ============================================================================

async function sendEmail(to: string, subject: string, body: string) {
  if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) {
    console.log(`[Sunny Email Skipped] Would send to ${to}: ${subject}`);
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

export async function executeSunnyTool(
  name: string,
  input: any,
  ctx: SunnyToolContext
): Promise<{ result: any; isError?: boolean }> {
  const { serviceClient, tenantId, userId } = ctx;

  try {
    switch (name) {
      // ── 1. check_inventory ──
      case 'check_inventory': {
        let query = serviceClient
          .from('inventory_items')
          .select('id, name, type, material, quantity_on_hand, sell_price, cost_per_unit, unit, reorder_threshold, is_active')
          .eq('tenant_id', tenantId)
          .eq('is_active', true)
          .order('type')
          .order('name');

        if (input.type) query = query.eq('type', input.type);
        if (input.query) query = query.ilike('name', `%${input.query}%`);

        const { data, error } = await query.limit(50);
        if (error) return { result: { error: error.message }, isError: true };

        const items = (data || []).map((i: any) => ({
          id: i.id,
          name: i.name,
          type: i.type,
          material: i.material,
          quantity: Number(i.quantity_on_hand),
          unit: i.unit,
          sell_price: Number(i.sell_price) || 0,
          cost: Number(i.cost_per_unit) || 0,
          low_stock: i.reorder_threshold ? Number(i.quantity_on_hand) <= Number(i.reorder_threshold) : false,
        }));

        return { result: { items, total: items.length } };
      }

      // ── 2. add_inventory ──
      case 'add_inventory': {
        // Map new param names with backward compat
        const effectiveCost = input.cost_per_inch ?? input.cost ?? 0;
        const effectiveQty = input.quantity ?? input.quantity_on_hand ?? 0;
        const effectiveType = input.type || 'chain';
        const effectiveUnit = input.unit || (effectiveType === 'chain' ? 'in' : 'each');

        const insertPayload: Record<string, any> = {
          tenant_id: tenantId,
          name: input.name,
          type: effectiveType,
          material: input.material || null,
          quantity_on_hand: effectiveQty,
          unit: effectiveUnit,
          cost_per_unit: effectiveCost,
          sell_price: input.sell_price || 0,
          supplier: input.supplier || null,
          reorder_threshold: input.reorder_point ?? null,
          is_active: true,
        };

        // Set pricing_mode for chains when prices or markup provided
        const hasChainPricing = input.markup || input.bracelet_price || input.anklet_price || input.ring_price || input.necklace_price_per_inch;
        if (effectiveType === 'chain' && hasChainPricing) {
          insertPayload.pricing_mode = 'per_product';
        }

        const { data, error } = await serviceClient
          .from('inventory_items')
          .insert(insertPayload)
          .select('id, name, type')
          .single();

        if (error) return { result: { error: error.message }, isError: true };

        // Calculate and upsert chain product prices
        const chainPriceResult: Record<string, number> = {};
        if (effectiveType === 'chain' && hasChainPricing && data) {
          const cost = effectiveCost;
          const markup = input.markup || 1;

          // Fetch product types for this tenant (with custom default_inches)
          const { data: productTypes } = await serviceClient
            .from('product_types')
            .select('id, name, default_inches')
            .eq('tenant_id', tenantId);

          if (productTypes && productTypes.length > 0) {
            // Build price map using tenant's custom default_inches when available
            const findDefault = (ptName: string, fallback: number | null) => {
              const pt = productTypes.find((p: any) => p.name.toLowerCase() === ptName);
              return pt?.default_inches ?? fallback;
            };

            const braceletInches = findDefault('bracelet', 7);
            const ankletInches = findDefault('anklet', 10);
            const ringInches = findDefault('ring', 2.5);

            // Calculate prices from markup (overridden by explicit prices)
            let braceletPrice = input.bracelet_price ?? (cost && input.markup && braceletInches ? braceletInches * cost * markup : undefined);
            let ankletPrice = input.anklet_price ?? (cost && input.markup && ankletInches ? ankletInches * cost * markup : undefined);
            let ringPrice = input.ring_price ?? (cost && input.markup && ringInches ? ringInches * cost * markup : undefined);
            let necklacePerInch = input.necklace_price_per_inch ?? (cost && input.markup ? cost * markup : undefined);

            const priceMap: { name: string; label: string; price: number | undefined; defaultInches: number | null }[] = [
              { name: 'bracelet', label: 'bracelet_price', price: braceletPrice, defaultInches: braceletInches },
              { name: 'anklet', label: 'anklet_price', price: ankletPrice, defaultInches: ankletInches },
              { name: 'ring', label: 'ring_price', price: ringPrice, defaultInches: ringInches },
              { name: 'necklace', label: 'necklace_price_per_inch', price: necklacePerInch, defaultInches: null },
            ];

            for (const pm of priceMap) {
              if (pm.price === undefined) continue;
              const pt = productTypes.find((p: any) => p.name.toLowerCase() === pm.name);
              if (!pt) continue;

              await serviceClient
                .from('chain_product_prices')
                .upsert({
                  inventory_item_id: data.id,
                  product_type_id: pt.id,
                  tenant_id: tenantId,
                  sell_price: pm.price,
                  default_inches: pm.defaultInches,
                  is_active: true,
                }, { onConflict: 'inventory_item_id,product_type_id' });

              chainPriceResult[pm.label] = pm.price;
            }
          }
        }

        return {
          result: {
            success: true,
            item: data,
            ...(Object.keys(chainPriceResult).length > 0 ? { chain_product_prices: chainPriceResult } : {}),
          },
        };
      }

      // ── 3. update_price ──
      case 'update_price': {
        const { error } = await serviceClient
          .from('inventory_items')
          .update({ sell_price: input.sell_price })
          .eq('id', input.item_id)
          .eq('tenant_id', tenantId);

        if (error) return { result: { error: error.message }, isError: true };
        return { result: { success: true, item_id: input.item_id, new_price: input.sell_price } };
      }

      // ── 4. search_clients ──
      case 'search_clients': {
        const limit = input.limit || 10;
        const q = input.query;

        const { data, error } = await serviceClient
          .from('clients')
          .select('id, first_name, last_name, email, phone, created_at')
          .eq('tenant_id', tenantId)
          .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%`)
          .order('created_at', { ascending: false })
          .limit(limit);

        if (error) return { result: { error: error.message }, isError: true };

        const clients = (data || []).map((c: any) => ({
          id: c.id,
          name: `${c.first_name || ''} ${c.last_name || ''}`.trim() || 'Unnamed',
          email: c.email,
          phone: c.phone,
          since: c.created_at,
        }));

        return { result: { clients, total: clients.length } };
      }

      // ── 5. get_client_details ──
      case 'get_client_details': {
        const [clientRes, salesRes, tagsRes, notesRes] = await Promise.all([
          serviceClient
            .from('clients')
            .select('id, first_name, last_name, email, phone, created_at')
            .eq('id', input.client_id)
            .eq('tenant_id', tenantId)
            .single(),
          serviceClient
            .from('sales')
            .select('id, total, created_at, status')
            .eq('tenant_id', tenantId)
            .eq('client_id', input.client_id)
            .eq('status', 'completed')
            .limit(20)
            .order('created_at', { ascending: false }),
          serviceClient
            .from('client_tag_assignments')
            .select('client_tags(name, color)')
            .eq('client_id', input.client_id),
          serviceClient
            .from('client_notes')
            .select('body, created_at')
            .eq('client_id', input.client_id)
            .eq('tenant_id', tenantId)
            .order('created_at', { ascending: false })
            .limit(5),
        ]);

        if (clientRes.error) return { result: { error: 'Client not found' }, isError: true };

        const client = clientRes.data;
        const tags = (tagsRes.data || []).map((t: any) => t.client_tags?.name).filter(Boolean);
        const notes = (notesRes.data || []).map((n: any) => ({ body: n.body, date: n.created_at }));
        const totalSpend = (salesRes.data || []).reduce((sum: number, s: any) => sum + Number(s.total), 0);

        return {
          result: {
            id: client.id,
            name: `${client.first_name || ''} ${client.last_name || ''}`.trim(),
            email: client.email,
            phone: client.phone,
            member_since: client.created_at,
            tags,
            recent_notes: notes,
            purchase_count: (salesRes.data || []).length,
            total_spend: totalSpend,
          },
        };
      }

      // ── 6. tag_client ──
      case 'tag_client': {
        // Find or create tag
        let { data: tag } = await serviceClient
          .from('client_tags')
          .select('id')
          .eq('tenant_id', tenantId)
          .eq('name', input.tag_name)
          .single();

        if (!tag) {
          const { data: newTag, error } = await serviceClient
            .from('client_tags')
            .insert({
              tenant_id: tenantId,
              name: input.tag_name.trim(),
              color: input.color || '#7A8B8C',
            })
            .select('id')
            .single();
          if (error) return { result: { error: error.message }, isError: true };
          tag = newTag;
        }

        // Assign tag to client
        const { error: assignError } = await serviceClient
          .from('client_tag_assignments')
          .upsert({
            client_id: input.client_id,
            tag_id: tag.id,
          }, { onConflict: 'client_id,tag_id' });

        if (assignError) return { result: { error: assignError.message }, isError: true };
        return { result: { success: true, tag_name: input.tag_name, client_id: input.client_id } };
      }

      // ── 7. add_client_note ──
      case 'add_client_note': {
        const { error } = await serviceClient
          .from('client_notes')
          .insert({
            tenant_id: tenantId,
            client_id: input.client_id,
            created_by: userId,
            body: input.note,
          });

        if (error) return { result: { error: error.message }, isError: true };
        return { result: { success: true, client_id: input.client_id } };
      }

      // ── 8. send_message (CONFIRMATION REQUIRED) ──
      case 'send_message': {
        // Fetch client + tenant for variables
        const [cRes, tRes] = await Promise.all([
          serviceClient.from('clients').select('first_name, last_name, email, phone').eq('id', input.client_id).eq('tenant_id', tenantId).single(),
          serviceClient.from('tenants').select('name, phone').eq('id', tenantId).single(),
        ]);

        if (cRes.error || !cRes.data) return { result: { error: 'Client not found' }, isError: true };

        const client = cRes.data;
        const tenant = tRes.data;
        const clientName = `${client.first_name || ''} ${client.last_name || ''}`.trim();

        const variables: Record<string, string> = {
          client_name: clientName,
          client_first_name: client.first_name || '',
          business_name: tenant?.name || '',
          business_phone: tenant?.phone || '',
        };

        const resolvedBody = renderTemplate(input.body, variables);
        const resolvedSubject = input.subject ? renderTemplate(input.subject, variables) : '';

        // If not confirmed, return preview
        if (!input.confirmed) {
          return {
            result: {
              pending_confirmation: true,
              preview: {
                to: clientName,
                to_contact: input.channel === 'sms' ? client.phone : client.email,
                channel: input.channel,
                body: resolvedBody,
                subject: resolvedSubject || undefined,
              },
            },
          };
        }

        // Confirmed — send it
        if (input.channel === 'sms') {
          if (!client.phone) return { result: { error: 'Client has no phone number' }, isError: true };
          await sendSMS(client.phone, resolvedBody);
        } else {
          if (!client.email) return { result: { error: 'Client has no email address' }, isError: true };
          await sendEmail(client.email, resolvedSubject || `Message from ${tenant?.name || 'your artist'}`, resolvedBody);
        }

        // Log to message_log
        await serviceClient.from('message_log').insert({
          tenant_id: tenantId,
          client_id: input.client_id,
          direction: 'outbound',
          channel: input.channel,
          recipient_email: input.channel === 'email' ? client.email : null,
          recipient_phone: input.channel === 'sms' ? client.phone : null,
          subject: input.channel === 'email' ? (resolvedSubject || `Message from ${tenant?.name}`) : null,
          body: resolvedBody,
          source: 'sunny_ai',
          status: 'sent',
        });

        return { result: { success: true, sent_to: clientName, channel: input.channel } };
      }

      // ── 9. send_bulk_message (CONFIRMATION REQUIRED) ──
      case 'send_bulk_message': {
        // Find tag
        const { data: tag } = await serviceClient
          .from('client_tags')
          .select('id, name')
          .eq('tenant_id', tenantId)
          .eq('name', input.tag_name)
          .single();

        if (!tag) return { result: { error: `Tag "${input.tag_name}" not found` }, isError: true };

        // Get assigned clients
        const { data: assignments } = await serviceClient
          .from('client_tag_assignments')
          .select('client_id, clients(id, first_name, last_name, email, phone)')
          .eq('tag_id', tag.id);

        const clients = (assignments || [])
          .map((a: any) => a.clients)
          .filter(Boolean);

        if (clients.length === 0) return { result: { error: `No clients have the "${input.tag_name}" tag` }, isError: true };

        // Get tenant info
        const { data: tenant } = await serviceClient
          .from('tenants')
          .select('name, phone')
          .eq('id', tenantId)
          .single();

        // If not confirmed, return preview
        if (!input.confirmed) {
          const eligible = clients.filter((c: any) =>
            input.channel === 'sms' ? c.phone : c.email
          );
          return {
            result: {
              pending_confirmation: true,
              preview: {
                tag: input.tag_name,
                total_clients: clients.length,
                eligible_clients: eligible.length,
                channel: input.channel,
                body: input.body,
                subject: input.subject || undefined,
                sample_names: eligible.slice(0, 5).map((c: any) =>
                  `${c.first_name || ''} ${c.last_name || ''}`.trim() || 'Unnamed'
                ),
              },
            },
          };
        }

        // Confirmed — send to all eligible clients
        let sent = 0;
        let failed = 0;
        for (const client of clients) {
          const clientName = `${client.first_name || ''} ${client.last_name || ''}`.trim();
          const variables: Record<string, string> = {
            client_name: clientName,
            client_first_name: client.first_name || '',
            business_name: tenant?.name || '',
            business_phone: tenant?.phone || '',
          };
          const resolvedBody = renderTemplate(input.body, variables);
          const resolvedSubject = input.subject ? renderTemplate(input.subject, variables) : '';

          try {
            if (input.channel === 'sms' && client.phone) {
              await sendSMS(client.phone, resolvedBody);
              sent++;
            } else if (input.channel === 'email' && client.email) {
              await sendEmail(client.email, resolvedSubject || `Message from ${tenant?.name || 'your artist'}`, resolvedBody);
              sent++;
            } else {
              failed++;
              continue;
            }

            // Log
            await serviceClient.from('message_log').insert({
              tenant_id: tenantId,
              client_id: client.id,
              direction: 'outbound',
              channel: input.channel,
              recipient_email: input.channel === 'email' ? client.email : null,
              recipient_phone: input.channel === 'sms' ? client.phone : null,
              subject: input.channel === 'email' ? (resolvedSubject || `Message from ${tenant?.name}`) : null,
              body: resolvedBody,
              source: 'sunny_ai',
              status: 'sent',
            });
          } catch {
            failed++;
          }
        }

        return { result: { success: true, sent, failed, tag: input.tag_name } };
      }

      // ── 10. enroll_in_workflow ──
      case 'enroll_in_workflow': {
        // Validate workflow
        const { data: workflow } = await serviceClient
          .from('workflow_templates')
          .select('id, name, is_active')
          .eq('id', input.workflow_id)
          .eq('tenant_id', tenantId)
          .single();

        if (!workflow) return { result: { error: 'Workflow not found' }, isError: true };
        if (!workflow.is_active) return { result: { error: 'Workflow is not active' }, isError: true };

        // Check duplicate
        const { data: steps } = await serviceClient
          .from('workflow_steps')
          .select('id, step_order, delay_hours, channel, template_name, description')
          .eq('workflow_id', input.workflow_id)
          .order('step_order');

        if (!steps || steps.length === 0) return { result: { error: 'Workflow has no steps' }, isError: true };

        const stepIds = new Set(steps.map((s: any) => s.id));
        const { data: existing } = await serviceClient
          .from('workflow_queue')
          .select('id, workflow_step_id')
          .eq('client_id', input.client_id)
          .eq('tenant_id', tenantId)
          .in('status', ['pending', 'ready']);

        if ((existing || []).some((e: any) => stepIds.has(e.workflow_step_id))) {
          return { result: { error: 'Client is already enrolled in this workflow' }, isError: true };
        }

        // Get client + tenant + templates for variable resolution
        const [cRes, tRes, templatesRes] = await Promise.all([
          serviceClient.from('clients').select('first_name, last_name').eq('id', input.client_id).single(),
          serviceClient.from('tenants').select('name, phone').eq('id', tenantId).single(),
          serviceClient.from('message_templates').select('name, body').eq('tenant_id', tenantId),
        ]);

        const clientName = cRes.data ? `${cRes.data.first_name || ''} ${cRes.data.last_name || ''}`.trim() || 'there' : 'there';
        const variables: Record<string, string> = {
          client_name: clientName,
          business_name: tRes.data?.name || 'our studio',
          business_phone: tRes.data?.phone || '',
        };

        const templateMap: Record<string, string> = {};
        for (const t of templatesRes.data || []) templateMap[t.name] = t.body;

        const now = new Date();
        const queueRows = steps.map((step: any) => {
          const scheduledFor = new Date(now.getTime() + step.delay_hours * 60 * 60 * 1000);
          let messageBody = templateMap[step.template_name] || step.template_name;
          messageBody = renderTemplate(messageBody, variables);
          return {
            tenant_id: tenantId,
            client_id: input.client_id,
            workflow_step_id: step.id,
            template_name: step.template_name,
            channel: step.channel,
            scheduled_for: scheduledFor.toISOString(),
            status: 'pending',
            message_body: messageBody,
            description: step.description,
          };
        });

        const { error: insertError } = await serviceClient.from('workflow_queue').insert(queueRows);
        if (insertError) return { result: { error: insertError.message }, isError: true };

        // Log note
        await serviceClient.from('client_notes').insert({
          tenant_id: tenantId,
          client_id: input.client_id,
          created_by: userId,
          body: `Enrolled in ${workflow.name} (via Sunny)`,
        });

        return { result: { success: true, workflow: workflow.name, steps_created: steps.length } };
      }

      // ── 11. create_event ──
      case 'create_event': {
        const { data, error } = await serviceClient
          .from('events')
          .insert({
            tenant_id: tenantId,
            name: input.name,
            start_time: input.start_time,
            end_time: input.end_time || null,
            location: input.location || null,
            notes: input.notes || null,
            is_active: true,
          })
          .select('id, name, start_time, location')
          .single();

        if (error) return { result: { error: error.message }, isError: true };
        return { result: { success: true, event: data } };
      }

      // ── 12. get_event_performance ──
      case 'get_event_performance': {
        const [eventRes, salesRes, queueRes] = await Promise.all([
          serviceClient
            .from('events')
            .select('id, name, location, start_time, end_time, booth_fee')
            .eq('id', input.event_id)
            .eq('tenant_id', tenantId)
            .single(),
          serviceClient
            .from('sales')
            .select('id, subtotal, tax_amount, tip_amount, total, payment_method, created_at')
            .eq('event_id', input.event_id)
            .eq('tenant_id', tenantId)
            .eq('status', 'completed'),
          serviceClient
            .from('queue_entries')
            .select('id, status')
            .eq('event_id', input.event_id)
            .eq('tenant_id', tenantId),
        ]);

        if (eventRes.error) return { result: { error: 'Event not found' }, isError: true };

        const event = eventRes.data;
        const sales = salesRes.data || [];
        const queue = queueRes.data || [];

        const revenue = sales.reduce((s: number, sale: any) => s + Number(sale.total), 0);
        const tips = sales.reduce((s: number, sale: any) => s + Number(sale.tip_amount), 0);
        const boothFee = Number(event.booth_fee) || 0;

        return {
          result: {
            event: { name: event.name, location: event.location, date: event.start_time },
            sales_count: sales.length,
            revenue,
            tips,
            booth_fee: boothFee,
            net_profit: revenue - boothFee,
            queue_total: queue.length,
            queue_served: queue.filter((q: any) => q.status === 'served').length,
            queue_no_show: queue.filter((q: any) => q.status === 'no_show').length,
          },
        };
      }

      // ── 13. list_events ──
      case 'list_events': {
        const limit = input.limit || 10;
        let query = serviceClient
          .from('events')
          .select('id, name, location, start_time, end_time, booth_fee, is_active')
          .eq('tenant_id', tenantId)
          .order('start_time', { ascending: false })
          .limit(limit);

        if (input.upcoming) {
          query = query.gte('start_time', new Date().toISOString());
          query = query.order('start_time', { ascending: true });
        }

        const { data, error } = await query;
        if (error) return { result: { error: error.message }, isError: true };

        return {
          result: {
            events: (data || []).map((e: any) => ({
              id: e.id,
              name: e.name,
              location: e.location,
              start_time: e.start_time,
              end_time: e.end_time,
              booth_fee: Number(e.booth_fee) || 0,
              is_active: e.is_active,
            })),
          },
        };
      }

      // ── 14. get_revenue_report ──
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

        const { data: sales, error } = await serviceClient
          .from('sales')
          .select('id, subtotal, tax_amount, tip_amount, total, payment_method, created_at')
          .eq('tenant_id', tenantId)
          .eq('status', 'completed')
          .gte('created_at', startDate.toISOString())
          .order('created_at', { ascending: false });

        if (error) return { result: { error: error.message }, isError: true };

        const allSales = sales || [];
        const revenue = allSales.reduce((s: number, sale: any) => s + Number(sale.subtotal), 0);
        const tax = allSales.reduce((s: number, sale: any) => s + Number(sale.tax_amount), 0);
        const tips = allSales.reduce((s: number, sale: any) => s + Number(sale.tip_amount), 0);
        const total = allSales.reduce((s: number, sale: any) => s + Number(sale.total), 0);

        const paymentBreakdown: Record<string, number> = {};
        allSales.forEach((s: any) => {
          paymentBreakdown[s.payment_method] = (paymentBreakdown[s.payment_method] || 0) + 1;
        });

        return {
          result: {
            period: input.period,
            start_date: startDate.toISOString(),
            sales_count: allSales.length,
            revenue,
            tax,
            tips,
            total,
            payment_breakdown: paymentBreakdown,
          },
        };
      }

      // ── 15. get_top_products ──
      case 'get_top_products': {
        const limit = input.limit || 10;
        const now = new Date();
        let startDate: Date | null = null;

        if (input.period && input.period !== 'all') {
          switch (input.period) {
            case 'week':
              startDate = new Date(now);
              startDate.setDate(now.getDate() - 7);
              break;
            case 'month':
              startDate = new Date(now.getFullYear(), now.getMonth(), 1);
              break;
            case 'year':
              startDate = new Date(now.getFullYear(), 0, 1);
              break;
          }
        }

        // Get sale IDs for this tenant in period
        let salesQuery = serviceClient
          .from('sales')
          .select('id')
          .eq('tenant_id', tenantId)
          .eq('status', 'completed');

        if (startDate) salesQuery = salesQuery.gte('created_at', startDate.toISOString());

        const { data: salesData } = await salesQuery;
        const saleIds = (salesData || []).map((s: any) => s.id);

        if (saleIds.length === 0) return { result: { products: [], message: 'No sales in this period' } };

        const { data: items } = await serviceClient
          .from('sale_items')
          .select('name, quantity, line_total')
          .in('sale_id', saleIds)
          .limit(500);

        const productCounts: Record<string, { quantity: number; revenue: number }> = {};
        (items || []).forEach((item: any) => {
          if (!productCounts[item.name]) productCounts[item.name] = { quantity: 0, revenue: 0 };
          productCounts[item.name].quantity += Number(item.quantity);
          productCounts[item.name].revenue += Number(item.line_total);
        });

        const products = Object.entries(productCounts)
          .sort((a, b) => b[1].quantity - a[1].quantity)
          .slice(0, limit)
          .map(([name, data]) => ({ name, ...data }));

        return { result: { products } };
      }

      // ── 16. get_client_stats ──
      case 'get_client_stats': {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        const [totalRes, newRes] = await Promise.all([
          serviceClient
            .from('clients')
            .select('id', { count: 'exact', head: true })
            .eq('tenant_id', tenantId),
          serviceClient
            .from('clients')
            .select('id', { count: 'exact', head: true })
            .eq('tenant_id', tenantId)
            .gte('created_at', startOfMonth.toISOString()),
        ]);

        return {
          result: {
            total_clients: totalRes.count || 0,
            new_this_month: newRes.count || 0,
          },
        };
      }

      // ── 17. update_settings ──
      case 'update_settings': {
        const updates: Record<string, any> = {};
        if (input.business_name) updates.name = input.business_name;
        if (input.phone) updates.phone = input.phone;
        if (input.theme_id) updates.theme_id = input.theme_id;

        if (Object.keys(updates).length > 0) {
          const { error } = await serviceClient
            .from('tenants')
            .update(updates)
            .eq('id', tenantId);

          if (error) return { result: { error: error.message }, isError: true };
        }

        // Handle tax_rate separately — update default tax profile
        if (input.tax_rate !== undefined) {
          const { data: defaultProfile } = await serviceClient
            .from('tax_profiles')
            .select('id')
            .eq('tenant_id', tenantId)
            .eq('is_default', true)
            .single();

          if (defaultProfile) {
            await serviceClient
              .from('tax_profiles')
              .update({ rate: input.tax_rate })
              .eq('id', defaultProfile.id);
          } else {
            await serviceClient
              .from('tax_profiles')
              .insert({
                tenant_id: tenantId,
                name: 'Default Tax',
                rate: input.tax_rate,
                is_default: true,
              });
          }
        }

        return { result: { success: true, updated: { ...updates, tax_rate: input.tax_rate } } };
      }

      // ── 18. get_settings ──
      case 'get_settings': {
        const [tenantRes, taxRes] = await Promise.all([
          serviceClient
            .from('tenants')
            .select('name, phone, subscription_tier, theme_id, fee_handling, created_at')
            .eq('id', tenantId)
            .single(),
          serviceClient
            .from('tax_profiles')
            .select('name, rate, is_default')
            .eq('tenant_id', tenantId)
            .order('is_default', { ascending: false }),
        ]);

        if (tenantRes.error) return { result: { error: tenantRes.error.message }, isError: true };

        return {
          result: {
            business_name: tenantRes.data.name,
            phone: tenantRes.data.phone,
            tier: tenantRes.data.subscription_tier,
            theme: tenantRes.data.theme_id,
            fee_handling: tenantRes.data.fee_handling,
            member_since: tenantRes.data.created_at,
            tax_profiles: (taxRes.data || []).map((t: any) => ({
              name: t.name,
              rate: Number(t.rate),
              is_default: t.is_default,
            })),
          },
        };
      }

      // ── 19. create_tax_profile ──
      case 'create_tax_profile': {
        // If setting as default, unset existing default first
        if (input.is_default) {
          await serviceClient
            .from('tax_profiles')
            .update({ is_default: false })
            .eq('tenant_id', tenantId)
            .eq('is_default', true);
        }

        const { data, error } = await serviceClient
          .from('tax_profiles')
          .insert({
            tenant_id: tenantId,
            name: input.name,
            rate: input.rate,
            is_default: input.is_default || false,
          })
          .select('id, name, rate, is_default')
          .single();

        if (error) return { result: { error: error.message }, isError: true };
        return { result: { success: true, tax_profile: data } };
      }

      // ── 20. update_inventory_item ──
      case 'update_inventory_item': {
        let item: any;

        // Support direct lookup by item_id (skip search)
        if (input.item_id) {
          const { data: directMatch, error: directErr } = await serviceClient
            .from('inventory_items')
            .select('id, name, type, material, quantity_on_hand, cost_per_unit, sell_price, unit, is_active')
            .eq('id', input.item_id)
            .eq('tenant_id', tenantId)
            .single();

          if (directErr || !directMatch) return { result: { error: `No inventory item found with ID "${input.item_id}"` }, isError: true };
          item = directMatch;
        } else if (input.search_name) {
          // Find item by name
          const { data: matches, error: searchErr } = await serviceClient
            .from('inventory_items')
            .select('id, name, type, material, quantity_on_hand, cost_per_unit, sell_price, unit, is_active')
            .eq('tenant_id', tenantId)
            .ilike('name', `%${input.search_name}%`);

          if (searchErr) return { result: { error: searchErr.message }, isError: true };
          if (!matches || matches.length === 0) return { result: { error: `No inventory item found matching "${input.search_name}"` }, isError: true };
          if (matches.length > 1) {
            return {
              result: {
                needs_clarification: true,
                message: `Multiple items match "${input.search_name}". Which one?`,
                matches: matches.map((m: any) => ({ id: m.id, name: m.name, type: m.type, material: m.material })),
              },
            };
          }
          item = matches[0];
        } else {
          return { result: { error: 'Provide either item_id or search_name to find the inventory item' }, isError: true };
        }

        const dbUpdates: Record<string, any> = {};

        if (input.updates.name !== undefined) dbUpdates.name = input.updates.name;
        if (input.updates.cost_per_inch !== undefined) dbUpdates.cost_per_unit = input.updates.cost_per_inch;
        if (input.updates.sell_price !== undefined) dbUpdates.sell_price = input.updates.sell_price;
        if (input.updates.current_length_inches !== undefined) dbUpdates.quantity_on_hand = input.updates.current_length_inches;
        if (input.updates.quantity_on_hand !== undefined) dbUpdates.quantity_on_hand = input.updates.quantity_on_hand;
        if (input.updates.reorder_point !== undefined) dbUpdates.reorder_threshold = input.updates.reorder_point;
        if (input.updates.material !== undefined) dbUpdates.material = input.updates.material;
        if (input.updates.supplier !== undefined) dbUpdates.supplier = input.updates.supplier;
        if (input.updates.is_active !== undefined) dbUpdates.is_active = input.updates.is_active;

        const hasPriceUpdates = input.updates.bracelet_price !== undefined ||
          input.updates.anklet_price !== undefined ||
          input.updates.ring_price !== undefined ||
          input.updates.necklace_price_per_inch !== undefined;

        if (Object.keys(dbUpdates).length === 0 && !hasPriceUpdates) return { result: { error: 'No valid updates provided' }, isError: true };

        if (Object.keys(dbUpdates).length > 0) {
          const { error: updateErr } = await serviceClient
            .from('inventory_items')
            .update(dbUpdates)
            .eq('id', item.id)
            .eq('tenant_id', tenantId);

          if (updateErr) return { result: { error: updateErr.message }, isError: true };
        }

        // Upsert chain product prices if any price fields provided
        const priceUpdates: Record<string, number> = {};
        if (hasPriceUpdates) {
          // Fetch product types for this tenant (with custom default_inches)
          const { data: productTypes } = await serviceClient
            .from('product_types')
            .select('id, name, default_inches')
            .eq('tenant_id', tenantId);

          if (productTypes && productTypes.length > 0) {
            const findDefault = (ptName: string, fallback: number | null) => {
              const pt = productTypes.find((p: any) => p.name.toLowerCase() === ptName);
              return pt?.default_inches ?? fallback;
            };

            const priceMap: { name: string; field: string; price: number | undefined; defaultInches: number | null }[] = [
              { name: 'bracelet', field: 'bracelet_price', price: input.updates.bracelet_price, defaultInches: findDefault('bracelet', 7) },
              { name: 'anklet', field: 'anklet_price', price: input.updates.anklet_price, defaultInches: findDefault('anklet', 10) },
              { name: 'ring', field: 'ring_price', price: input.updates.ring_price, defaultInches: findDefault('ring', 2.5) },
              { name: 'necklace', field: 'necklace_price_per_inch', price: input.updates.necklace_price_per_inch, defaultInches: null },
            ];

            for (const pm of priceMap) {
              if (pm.price === undefined) continue;
              const pt = productTypes.find((p: any) => p.name.toLowerCase() === pm.name);
              if (!pt) continue;

              await serviceClient
                .from('chain_product_prices')
                .upsert({
                  inventory_item_id: item.id,
                  product_type_id: pt.id,
                  tenant_id: tenantId,
                  sell_price: pm.price,
                  default_inches: pm.defaultInches,
                  is_active: true,
                }, { onConflict: 'inventory_item_id,product_type_id' });

              priceUpdates[pm.field] = pm.price;
            }
          }
        }

        return {
          result: {
            success: true,
            item_name: item.name,
            item_id: item.id,
            updates_applied: input.updates,
            ...(Object.keys(priceUpdates).length > 0 ? { chain_product_prices_updated: priceUpdates } : {}),
          },
        };
      }

      // ── 21. update_client ──
      case 'update_client': {
        let clientId = input.client_id;

        // Search by name if no ID
        if (!clientId && input.client_name) {
          const q = input.client_name;
          const { data: matches } = await serviceClient
            .from('clients')
            .select('id, first_name, last_name, email, phone')
            .eq('tenant_id', tenantId)
            .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%`)
            .limit(5);

          if (!matches || matches.length === 0) return { result: { error: `No client found matching "${input.client_name}"` }, isError: true };
          if (matches.length > 1) {
            return {
              result: {
                needs_clarification: true,
                message: `Multiple clients match "${input.client_name}". Which one?`,
                matches: matches.map((c: any) => ({
                  id: c.id,
                  name: `${c.first_name || ''} ${c.last_name || ''}`.trim(),
                  email: c.email,
                  phone: c.phone,
                })),
              },
            };
          }
          clientId = matches[0].id;
        }

        if (!clientId) return { result: { error: 'Provide client_id or client_name to find the client' }, isError: true };

        const dbUpdates: Record<string, any> = {};
        if (input.updates.name) {
          const parts = input.updates.name.trim().split(/\s+/);
          dbUpdates.first_name = parts[0];
          dbUpdates.last_name = parts.slice(1).join(' ') || null;
        }
        if (input.updates.email !== undefined) dbUpdates.email = input.updates.email;
        if (input.updates.phone !== undefined) dbUpdates.phone = input.updates.phone;

        if (Object.keys(dbUpdates).length === 0) return { result: { error: 'No valid updates provided' }, isError: true };

        const { error } = await serviceClient
          .from('clients')
          .update(dbUpdates)
          .eq('id', clientId)
          .eq('tenant_id', tenantId);

        if (error) return { result: { error: error.message }, isError: true };
        return { result: { success: true, client_id: clientId, updates_applied: input.updates } };
      }

      // ── 22. update_event ──
      case 'update_event': {
        let eventId = input.event_id;

        if (!eventId && input.event_name) {
          const { data: matches } = await serviceClient
            .from('events')
            .select('id, name, start_time, location')
            .eq('tenant_id', tenantId)
            .ilike('name', `%${input.event_name}%`)
            .limit(5);

          if (!matches || matches.length === 0) return { result: { error: `No event found matching "${input.event_name}"` }, isError: true };
          if (matches.length > 1) {
            return {
              result: {
                needs_clarification: true,
                message: `Multiple events match "${input.event_name}". Which one?`,
                matches: matches.map((e: any) => ({ id: e.id, name: e.name, date: e.start_time, location: e.location })),
              },
            };
          }
          eventId = matches[0].id;
        }

        if (!eventId) return { result: { error: 'Provide event_id or event_name to find the event' }, isError: true };

        const dbUpdates: Record<string, any> = {};
        if (input.updates.name) dbUpdates.name = input.updates.name;
        if (input.updates.start_time) dbUpdates.start_time = input.updates.start_time;
        if (input.updates.end_time) dbUpdates.end_time = input.updates.end_time;
        if (input.updates.location) dbUpdates.location = input.updates.location;
        if (input.updates.notes) dbUpdates.notes = input.updates.notes;
        if (input.updates.booth_fee !== undefined) dbUpdates.booth_fee = input.updates.booth_fee;

        if (Object.keys(dbUpdates).length === 0) return { result: { error: 'No valid updates provided' }, isError: true };

        const { error } = await serviceClient
          .from('events')
          .update(dbUpdates)
          .eq('id', eventId)
          .eq('tenant_id', tenantId);

        if (error) return { result: { error: error.message }, isError: true };
        return { result: { success: true, event_id: eventId, updates_applied: input.updates } };
      }

      // ── 23. delete_event ──
      case 'delete_event': {
        let eventId = input.event_id;

        if (!eventId && input.event_name) {
          const { data: matches } = await serviceClient
            .from('events')
            .select('id, name, start_time')
            .eq('tenant_id', tenantId)
            .ilike('name', `%${input.event_name}%`)
            .limit(5);

          if (!matches || matches.length === 0) return { result: { error: `No event found matching "${input.event_name}"` }, isError: true };
          if (matches.length > 1) {
            return {
              result: {
                needs_clarification: true,
                message: `Multiple events match "${input.event_name}". Which one?`,
                matches: matches.map((e: any) => ({ id: e.id, name: e.name, date: e.start_time })),
              },
            };
          }
          eventId = matches[0].id;
        }

        if (!eventId) return { result: { error: 'Provide event_id or event_name to find the event' }, isError: true };

        if (input.action === 'cancel') {
          const { error } = await serviceClient
            .from('events')
            .update({ is_active: false })
            .eq('id', eventId)
            .eq('tenant_id', tenantId);
          if (error) return { result: { error: error.message }, isError: true };
          return { result: { success: true, action: 'cancelled', event_id: eventId } };
        } else {
          const { error } = await serviceClient
            .from('events')
            .delete()
            .eq('id', eventId)
            .eq('tenant_id', tenantId);
          if (error) return { result: { error: error.message }, isError: true };
          return { result: { success: true, action: 'deleted', event_id: eventId } };
        }
      }

      // ── 24. update_template ──
      case 'update_template': {
        const { data: matches } = await serviceClient
          .from('message_templates')
          .select('id, name, body, subject, channel, category')
          .eq('tenant_id', tenantId)
          .ilike('name', `%${input.template_name}%`)
          .limit(5);

        if (!matches || matches.length === 0) return { result: { error: `No template found matching "${input.template_name}"` }, isError: true };
        if (matches.length > 1) {
          return {
            result: {
              needs_clarification: true,
              message: `Multiple templates match "${input.template_name}". Which one?`,
              matches: matches.map((t: any) => ({ id: t.id, name: t.name, channel: t.channel, category: t.category })),
            },
          };
        }

        const template = matches[0];
        const dbUpdates: Record<string, any> = {};
        if (input.updates.name) dbUpdates.name = input.updates.name;
        if (input.updates.body) dbUpdates.body = input.updates.body;
        if (input.updates.subject !== undefined) dbUpdates.subject = input.updates.subject;
        if (input.updates.channel) dbUpdates.channel = input.updates.channel;
        if (input.updates.category) dbUpdates.category = input.updates.category;

        if (Object.keys(dbUpdates).length === 0) return { result: { error: 'No valid updates provided' }, isError: true };

        const { error } = await serviceClient
          .from('message_templates')
          .update(dbUpdates)
          .eq('id', template.id)
          .eq('tenant_id', tenantId);

        if (error) return { result: { error: error.message }, isError: true };
        return { result: { success: true, template_name: template.name, updates_applied: input.updates } };
      }

      // ── 25. create_template ──
      case 'create_template': {
        const { data, error } = await serviceClient
          .from('message_templates')
          .insert({
            tenant_id: tenantId,
            name: input.name,
            channel: input.channel,
            category: input.category || 'general',
            subject: input.subject || null,
            body: input.body,
          })
          .select('id, name, channel, category')
          .single();

        if (error) {
          if (error.code === '23505') return { result: { error: 'A template with that name already exists' }, isError: true };
          return { result: { error: error.message }, isError: true };
        }
        return { result: { success: true, template: data } };
      }

      // ── 26. delete_inventory_item ──
      case 'delete_inventory_item': {
        const { data: matches } = await serviceClient
          .from('inventory_items')
          .select('id, name, type, material')
          .eq('tenant_id', tenantId)
          .ilike('name', `%${input.search_name}%`);

        if (!matches || matches.length === 0) return { result: { error: `No inventory item found matching "${input.search_name}"` }, isError: true };
        if (matches.length > 1) {
          return {
            result: {
              needs_clarification: true,
              message: `Multiple items match "${input.search_name}". Which one?`,
              matches: matches.map((m: any) => ({ id: m.id, name: m.name, type: m.type, material: m.material })),
            },
          };
        }

        const item = matches[0];

        // ── Confirmation gate — preview first, execute only with confirmed: true ──
        if (!input.confirmed) {
          return {
            result: {
              pending_confirmation: true,
              preview: `${input.action === 'delete' ? '🗑️ PERMANENTLY DELETE' : '🔒 Deactivate'}: "${item.name}" (${item.type}, ${item.material || 'no material'})`,
              message: `Are you sure you want to ${input.action} "${item.name}"?${input.action === 'delete' ? ' This cannot be undone.' : ' It will be hidden but can be reactivated later.'}`,
            },
          };
        }

        if (input.action === 'deactivate') {
          const { error } = await serviceClient
            .from('inventory_items')
            .update({ is_active: false })
            .eq('id', item.id)
            .eq('tenant_id', tenantId);
          if (error) return { result: { error: 'Failed to deactivate item' }, isError: true };
          return { result: { success: true, action: 'deactivated', item_name: item.name } };
        } else {
          const { error } = await serviceClient
            .from('inventory_items')
            .delete()
            .eq('id', item.id)
            .eq('tenant_id', tenantId);
          if (error) return { result: { error: 'Failed to delete item' }, isError: true };
          return { result: { success: true, action: 'deleted', item_name: item.name } };
        }
      }

      // ── 27. create_workflow ──
      case 'create_workflow': {
        // Create workflow template
        const { data: workflow, error: wfError } = await serviceClient
          .from('workflow_templates')
          .insert({
            tenant_id: tenantId,
            name: input.name,
            trigger_type: input.trigger_type,
            is_active: true,
          })
          .select('id, name')
          .single();

        if (wfError) return { result: { error: wfError.message }, isError: true };

        // Create steps
        const stepRows = (input.steps || []).map((step: any, i: number) => ({
          workflow_id: workflow.id,
          step_order: i + 1,
          delay_hours: step.delay_hours || 0,
          channel: step.channel,
          template_name: step.template_name,
          description: step.description || null,
        }));

        if (stepRows.length > 0) {
          const { error: stepsError } = await serviceClient
            .from('workflow_steps')
            .insert(stepRows);
          if (stepsError) return { result: { error: stepsError.message }, isError: true };
        }

        return {
          result: {
            success: true,
            workflow: { id: workflow.id, name: workflow.name },
            steps_created: stepRows.length,
          },
        };
      }

      // ── 28. update_workflow ──
      case 'update_workflow': {
        const { data: matches } = await serviceClient
          .from('workflow_templates')
          .select('id, name, is_active, trigger_type')
          .eq('tenant_id', tenantId)
          .ilike('name', `%${input.workflow_name}%`)
          .limit(5);

        if (!matches || matches.length === 0) return { result: { error: `No workflow found matching "${input.workflow_name}"` }, isError: true };
        if (matches.length > 1) {
          return {
            result: {
              needs_clarification: true,
              message: `Multiple workflows match "${input.workflow_name}". Which one?`,
              matches: matches.map((w: any) => ({ id: w.id, name: w.name, active: w.is_active })),
            },
          };
        }

        const workflow = matches[0];
        const dbUpdates: Record<string, any> = {};
        if (input.updates.name) dbUpdates.name = input.updates.name;
        if (input.updates.is_active !== undefined) dbUpdates.is_active = input.updates.is_active;

        if (Object.keys(dbUpdates).length > 0) {
          const { error } = await serviceClient
            .from('workflow_templates')
            .update(dbUpdates)
            .eq('id', workflow.id)
            .eq('tenant_id', tenantId);
          if (error) return { result: { error: error.message }, isError: true };
        }

        // Replace steps if provided
        if (input.updates.steps && Array.isArray(input.updates.steps)) {
          // Delete existing steps
          await serviceClient
            .from('workflow_steps')
            .delete()
            .eq('workflow_id', workflow.id);

          // Insert new steps
          const stepRows = input.updates.steps.map((step: any, i: number) => ({
            workflow_id: workflow.id,
            step_order: i + 1,
            delay_hours: step.delay_hours || 0,
            channel: step.channel,
            template_name: step.template_name,
            description: step.description || null,
          }));

          if (stepRows.length > 0) {
            const { error: stepsError } = await serviceClient
              .from('workflow_steps')
              .insert(stepRows);
            if (stepsError) return { result: { error: stepsError.message }, isError: true };
          }
        }

        return {
          result: {
            success: true,
            workflow_name: workflow.name,
            updates_applied: input.updates,
          },
        };
      }

      // ── 29. find_sale ───────────────────────────────────────────────────
      case 'find_sale': {
        let query = serviceClient
          .from('sales')
          .select('id, created_at, total, payment_method, payment_provider, refund_status, refund_amount, status, client:clients(id, first_name, last_name), items:sale_items(name, quantity), event:events(name)')
          .eq('tenant_id', tenantId)
          .eq('status', 'completed')
          .order('created_at', { ascending: false });

        if (input.sale_id) {
          query = query.eq('id', input.sale_id);
        } else {
          if (input.date) {
            query = query.gte('created_at', `${input.date}T00:00:00`).lte('created_at', `${input.date}T23:59:59`);
          }
          if (input.amount) {
            const tolerance = input.amount * 0.05;
            query = query.gte('total', input.amount - tolerance).lte('total', input.amount + tolerance);
          }
        }

        const { data, error } = await query.limit(input.limit || 5);
        if (error) return { result: { error: error.message }, isError: true };

        let results = (data || []).map((s: any) => ({
          id: s.id,
          date: s.created_at,
          total: Number(s.total),
          payment_method: s.payment_method,
          payment_provider: s.payment_provider,
          refund_status: s.refund_status || 'none',
          refund_amount: Number(s.refund_amount) || 0,
          client_name: s.client ? `${s.client.first_name || ''} ${s.client.last_name || ''}`.trim() : 'Walk-in',
          items: (s.items || []).map((i: any) => i.name),
          event_name: s.event?.name || null,
        }));

        // Client name filter (post-query since it's a join)
        if (input.client_name) {
          const search = input.client_name.toLowerCase();
          results = results.filter((s: any) => s.client_name.toLowerCase().includes(search));
        }

        return { result: { sales: results, total: results.length } };
      }

      // ── 30. process_refund ────────────────────────────────────────────────
      case 'process_refund': {
        // Fetch the sale
        const { data: sale, error: saleErr } = await serviceClient
          .from('sales')
          .select('id, total, refund_status, refund_amount, payment_method, payment_provider, payment_provider_id, client:clients(id, first_name, last_name), items:sale_items(name, quantity)')
          .eq('id', input.sale_id)
          .eq('tenant_id', tenantId)
          .single();

        if (saleErr || !sale) return { result: { error: 'Sale not found' }, isError: true };
        if (sale.refund_status === 'full') return { result: { error: 'Sale is already fully refunded' }, isError: true };

        const maxRefundable = Number(sale.total) - (Number(sale.refund_amount) || 0);
        const refundAmount = input.amount ? Math.min(input.amount, maxRefundable) : maxRefundable;
        if (refundAmount <= 0) return { result: { error: 'No refundable amount remaining' }, isError: true };

        const clientName = sale.client ? `${sale.client.first_name || ''} ${sale.client.last_name || ''}`.trim() : 'Walk-in';
        const itemNames = (sale.items || []).map((i: any) => i.name);
        const isFullRefund = refundAmount >= maxRefundable;

        // Preview mode
        if (!input.confirmed) {
          return {
            result: {
              pending_confirmation: true,
              preview: {
                sale_id: sale.id,
                client_name: clientName,
                items: itemNames,
                sale_total: Number(sale.total),
                already_refunded: Number(sale.refund_amount) || 0,
                refund_amount: refundAmount,
                refund_type: isFullRefund ? 'full' : 'partial',
                payment_method: sale.payment_method,
                payment_provider: sale.payment_provider,
                reason: input.reason || null,
                note: sale.payment_method === 'cash' || sale.payment_method === 'venmo'
                  ? 'This is a cash/Venmo payment — refund will be recorded but you must return money manually.'
                  : `Card refund will be automatically processed via ${sale.payment_provider || 'Stripe'}.`,
              },
            },
          };
        }

        // Confirmed — call the refund API
        // We use a direct fetch to /api/sales/[id]/refund which handles Stripe/Square/cash
        // But since this runs server-side, we do the refund logic inline
        const Stripe = (await import('stripe')).default;
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', { apiVersion: '2025-03-31.basil' as any });

        let stripeRefundId: string | null = null;
        let squareRefundId: string | null = null;

        if (sale.payment_provider === 'stripe' && sale.payment_provider_id) {
          const stripeRefund = await stripe.refunds.create({
            payment_intent: sale.payment_provider_id,
            amount: Math.round(refundAmount * 100),
            reason: 'requested_by_customer',
          });
          stripeRefundId = stripeRefund.id;
        } else if (sale.payment_provider === 'square' && sale.payment_provider_id) {
          const { Client: SquareClient, Environment } = await import('square');
          const { data: tenantData } = await serviceClient
            .from('tenants')
            .select('square_access_token')
            .eq('id', tenantId)
            .single();
          if (!tenantData?.square_access_token) {
            return { result: { error: 'Square not connected' }, isError: true };
          }
          const squareClient = new SquareClient({
            accessToken: tenantData.square_access_token,
            environment: process.env.NODE_ENV === 'production' ? Environment.Production : Environment.Sandbox,
          });
          const { result: sqResult } = await squareClient.refundsApi.refundPayment({
            idempotencyKey: `refund-${sale.id}-${Date.now()}`,
            paymentId: sale.payment_provider_id,
            amountMoney: { amount: BigInt(Math.round(refundAmount * 100)), currency: 'USD' },
            reason: input.reason || 'Refund via Sunny',
          });
          squareRefundId = sqResult.refund?.id || null;
        }

        // Record the refund
        await serviceClient.from('refunds').insert({
          tenant_id: tenantId,
          sale_id: sale.id,
          amount: refundAmount,
          reason: input.reason || null,
          payment_method: sale.payment_method,
          stripe_refund_id: stripeRefundId,
          square_refund_id: squareRefundId,
          created_by: userId,
        });

        const newRefundAmount = (Number(sale.refund_amount) || 0) + refundAmount;
        const newStatus = newRefundAmount >= Number(sale.total) ? 'full' : 'partial';
        await serviceClient.from('sales').update({
          refund_amount: newRefundAmount,
          refund_status: newStatus,
          refunded_at: new Date().toISOString(),
          refunded_by: userId,
        }).eq('id', sale.id);

        return {
          result: {
            success: true,
            client_name: clientName,
            refund_amount: refundAmount,
            refund_status: newStatus,
            payment_method: sale.payment_method,
          },
        };
      }

      // ── 31. add_expense ───────────────────────────────────────────────────
      case 'add_expense': {
        const today = new Date().toISOString().split('T')[0];
        const { data, error } = await serviceClient
          .from('expenses')
          .insert({
            tenant_id: tenantId,
            name: input.name,
            amount: input.amount,
            category: input.category,
            date: input.date || today,
            event_id: input.event_id || null,
            notes: input.notes || null,
            is_recurring: input.is_recurring || false,
            recurring_frequency: input.is_recurring ? (input.recurring_frequency || 'monthly') : null,
            created_by: userId,
          })
          .select('id, name, amount, category, date')
          .single();

        if (error) return { result: { error: error.message }, isError: true };
        return { result: { success: true, expense: data } };
      }

      // ── 32. get_expenses ──────────────────────────────────────────────────
      case 'get_expenses': {
        const today = new Date().toISOString().split('T')[0];
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const startDate = input.start_date || thirtyDaysAgo;
        const endDate = input.end_date || today;

        let query = serviceClient
          .from('expenses')
          .select('id, name, amount, category, date, notes, is_recurring, recurring_frequency, event:events(name)')
          .eq('tenant_id', tenantId)
          .gte('date', startDate)
          .lte('date', endDate)
          .order('date', { ascending: false });

        if (input.category) query = query.eq('category', input.category);
        if (input.event_id) query = query.eq('event_id', input.event_id);

        const { data, error } = await query.limit(100);
        if (error) return { result: { error: error.message }, isError: true };

        const expenses = (data || []).map((e: any) => ({
          id: e.id,
          name: e.name,
          amount: Number(e.amount),
          category: e.category,
          date: e.date,
          notes: e.notes,
          is_recurring: e.is_recurring,
          recurring_frequency: e.recurring_frequency,
          event_name: e.event?.name || null,
        }));

        const total = expenses.reduce((s: number, e: any) => s + e.amount, 0);
        const byCategory: Record<string, number> = {};
        for (const e of expenses) {
          byCategory[e.category] = (byCategory[e.category] || 0) + e.amount;
        }

        return { result: { expenses, total, by_category: byCategory, period: { start: startDate, end: endDate } } };
      }

      // ── 33. search_sunstone_catalog ──────────────────────────────────────
      case 'search_sunstone_catalog': {
        // Read cached catalog from Supabase
        const { data: cache, error: cacheErr } = await serviceClient
          .from('sunstone_catalog_cache')
          .select('products, synced_at')
          .limit(1)
          .single();

        if (cacheErr || !cache?.products) {
          return { result: { error: 'Sunstone catalog not available. It may need to be synced — tell the artist to ask their admin to run a catalog sync.' }, isError: true };
        }

        const allProducts = cache.products as any[];
        const searchQuery = (input.query || '').toLowerCase().trim();
        const typeFilter = (input.product_type || '').toLowerCase().trim();
        const maxResults = Math.min(input.limit || 10, 25);

        // Chain name aliases (same product, different spellings across Sunstone materials)
        const CHAIN_ALIASES: Record<string, string[]> = {
          'lavina': ['lavinia'],
          'lavinia': ['lavina'],
        };

        // Split query into individual search terms + expand aliases for broader matching
        const rawTerms = searchQuery.split(/\s+/).filter(Boolean);
        const searchTerms: string[] = [];
        for (const term of rawTerms) {
          searchTerms.push(term);
          const aliases = CHAIN_ALIASES[term];
          if (aliases) searchTerms.push(...aliases);
        }
        // Also expand full query aliases (for single-word searches like "lavina")
        const queryAliases = CHAIN_ALIASES[searchQuery];
        const expandedQueries = queryAliases ? [searchQuery, ...queryAliases] : [searchQuery];

        // Score and filter products
        const scored = allProducts.map((p: any) => {
          let score = 0;
          const title = (p.title || '').toLowerCase();
          const handle = (p.handle || '').toLowerCase();
          const desc = (p.description || '').toLowerCase();
          const pType = (p.productType || '').toLowerCase();
          const tags = (p.tags || []).map((t: string) => t.toLowerCase());

          // Exact title match is highest priority (check aliases too)
          for (const eq of expandedQueries) {
            if (title === eq) { score += 100; break; }
            else if (title.startsWith(eq)) { score = Math.max(score, 70); }
            else if (handle.startsWith(eq)) { score = Math.max(score, 65); }
            else if (title.includes(eq)) { score = Math.max(score, 50); }
            else if (handle.includes(eq)) { score = Math.max(score, 40); }
          }
          // Each search term found in title/handle
          for (const term of searchTerms) {
            if (title.startsWith(term)) score += 30;
            if (handle.startsWith(term)) score += 25;
            if (title.includes(term)) score += 20;
            if (handle.includes(term)) score += 15;
            if (pType.includes(term)) score += 15;
            if (tags.some((t: string) => t.includes(term))) score += 10;
            if (desc.includes(term)) score += 5;
          }

          // Product type filter
          if (typeFilter && !pType.includes(typeFilter)) {
            score = 0; // Hard filter
          }

          // Filter out drafts/archived unless specifically looking for them
          if (p.status && p.status !== 'ACTIVE' && !searchQuery.includes('draft') && !searchQuery.includes('archived')) {
            score = 0;
          }

          return { product: p, score };
        })
        .filter(s => s.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, maxResults);

        const domain = process.env.SHOPIFY_STORE_DOMAIN || '';
        const results = scored.map(({ product: p }) => {
          const defaultVariant = p.variants?.[0];
          const prices = (p.variants || []).map((v: any) => parseFloat(v.price || '0')).filter((n: number) => n > 0);
          const minPrice = prices.length > 0 ? Math.min(...prices) : null;
          const maxPrice = prices.length > 0 ? Math.max(...prices) : null;

          return {
            title: p.title,
            handle: p.handle,
            productType: p.productType || '',
            tags: p.tags || [],
            price: minPrice === maxPrice
              ? (minPrice ? `$${minPrice.toFixed(2)}` : 'Price not listed')
              : `$${minPrice!.toFixed(2)} – $${maxPrice!.toFixed(2)}`,
            description: p.description ? p.description.slice(0, 150) : '',
            imageUrl: p.imageUrl || null,
            url: p.url || `https://${domain}/products/${p.handle}`,
            variantCount: (p.variants || []).length,
            variants: (p.variants || []).slice(0, 5).map((v: any) => ({
              title: v.title,
              price: v.price,
              sku: v.sku || null,
              inStock: v.inventoryQuantity == null ? true : v.inventoryQuantity > 0,
            })),
          };
        });

        return {
          result: {
            products: results,
            total_found: results.length,
            catalog_total: allProducts.length,
            synced_at: cache.synced_at,
            note: results.length === 0
              ? `No products found matching "${input.query}". The catalog has ${allProducts.length} total products.`
              : undefined,
          },
        };
      }

      default:
        return { result: { error: `Unknown tool: ${name}` }, isError: true };
    }
  } catch (err: any) {
    console.error(`[SunnyTool:${name}] Error:`, err);
    return { result: { error: err.message || 'Tool execution failed' }, isError: true };
  }
}
