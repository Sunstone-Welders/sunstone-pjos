'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useTenant } from '@/hooks/use-tenant';
import { toast } from 'sonner';
import {
  ClientsHeader,
  ClientSearch,
  TagFilterChips,
  ClientList,
  ClientProfile,
  ClientFormModal,
  TagManagerModal,
} from '@/components/clients';
import ImportModal from '@/components/ImportModal';
import UpgradePrompt from '@/components/ui/UpgradePrompt';
import { getCrmStatus } from '@/lib/crm-status';
import type { Client, ClientTag, ClientSegment } from '@/types';
import { downloadCSV, escapeCSVField } from '@/lib/csv-templates';
import SunnyTutorial from '@/components/SunnyTutorial';

interface TagWithCount extends ClientTag {
  usage_count: number;
}

type ClientTagMap = Record<string, string[]>;

export default function ClientsPage() {
  const { tenant, can } = useTenant();
  const router = useRouter();
  const supabase = createClient();

  // Core state
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [profileClientId, setProfileClientId] = useState<string | null>(null);

  // Tag state
  const [tags, setTags] = useState<TagWithCount[]>([]);
  const [clientTagMap, setClientTagMap] = useState<ClientTagMap>({});
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [showTagManager, setShowTagManager] = useState(false);

  // Segment state
  const [segments, setSegments] = useState<ClientSegment[]>([]);
  const [savingSegment, setSavingSegment] = useState(false);
  const [activeSegment, setActiveSegment] = useState<ClientSegment | null>(null);

  // Subscription gating
  const isStarter = (() => {
    if (!tenant) return true;
    if (tenant.subscription_status === 'active' && (tenant.subscription_tier === 'pro' || tenant.subscription_tier === 'business')) return false;
    if (tenant.trial_ends_at && new Date(tenant.trial_ends_at) > new Date()) return false;
    return true;
  })();

  const crmEnabled = getCrmStatus(tenant).active;

  // ── Fetch clients ─────────────────────────────────────────────────────────
  const fetchClients = useCallback(async () => {
    if (!tenant) return;
    let query = supabase
      .from('clients')
      .select('*')
      .eq('tenant_id', tenant.id)
      .order('created_at', { ascending: false });

    if (search) {
      query = query.or(
        `first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`
      );
    }

    const { data } = await query;
    setClients((data || []) as Client[]);
    setLoading(false);
  }, [tenant, search]);

  useEffect(() => { fetchClients(); }, [fetchClients]);

  // ── Fetch tags ────────────────────────────────────────────────────────────
  const fetchTags = useCallback(async () => {
    if (!tenant || isStarter) return;
    const res = await fetch(`/api/tags?tenantId=${tenant.id}`);
    if (res.ok) setTags(await res.json());
  }, [tenant, isStarter]);

  // ── Fetch tag assignments ─────────────────────────────────────────────────
  const fetchTagAssignments = useCallback(async () => {
    if (!tenant || isStarter || clients.length === 0) return;
    const { data } = await supabase
      .from('client_tag_assignments')
      .select('client_id, tag_id')
      .in('client_id', clients.map((c) => c.id));

    const map: ClientTagMap = {};
    for (const a of data || []) {
      if (!map[a.client_id]) map[a.client_id] = [];
      map[a.client_id].push(a.tag_id);
    }
    setClientTagMap(map);
  }, [tenant, isStarter, clients]);

  // ── Fetch segments ────────────────────────────────────────────────────────
  const fetchSegments = useCallback(async () => {
    if (!tenant || isStarter) return;
    const res = await fetch(`/api/segments?tenantId=${tenant.id}`);
    if (res.ok) setSegments(await res.json());
  }, [tenant, isStarter]);

  useEffect(() => { fetchTags(); fetchSegments(); }, [fetchTags, fetchSegments]);
  useEffect(() => { if (clients.length > 0) fetchTagAssignments(); }, [clients, fetchTagAssignments]);

  // ── Tag filtering (AND logic) ─────────────────────────────────────────────
  const filteredClients = selectedTagIds.length > 0
    ? clients.filter((c) => {
        const ct = clientTagMap[c.id] || [];
        return selectedTagIds.every((tagId) => ct.includes(tagId));
      })
    : clients;

  // ── Handlers ──────────────────────────────────────────────────────────────
  const toggleTagFilter = (tagId: string) => {
    setActiveSegment(null);
    setSelectedTagIds((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]
    );
  };

  const applySegment = (segment: ClientSegment) => {
    setSelectedTagIds(segment.filter_criteria?.tagIds || []);
    setActiveSegment(segment);
  };

  const saveAsSegment = async () => {
    if (!tenant || selectedTagIds.length === 0) return;
    const name = prompt('Segment name:');
    if (!name) return;
    setSavingSegment(true);
    const res = await fetch('/api/segments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenant_id: tenant.id, name, filter_criteria: { tagIds: selectedTagIds } }),
    });
    setSavingSegment(false);
    if (res.ok) { toast.success('Segment saved'); fetchSegments(); }
    else toast.error('Failed to save segment');
  };

  const deleteSegment = async (id: string) => {
    const res = await fetch(`/api/segments/${id}`, { method: 'DELETE' });
    if (res.ok) {
      toast.success('Segment deleted');
      if (activeSegment?.id === id) { setActiveSegment(null); setSelectedTagIds([]); }
      fetchSegments();
    }
  };

  const handleAddClient = async (data: Partial<Client>) => {
    if (!tenant) return;
    const { error } = await supabase.from('clients').insert({ ...data, tenant_id: tenant.id });
    if (error) { toast.error(error.message); return; }
    toast.success('Client added');
    setShowForm(false);
    fetchClients();
  };

  const handleEditClient = async (data: Partial<Client>) => {
    if (!editingClient) return;
    const { error } = await supabase.from('clients').update(data).eq('id', editingClient.id);
    if (error) { toast.error(error.message); return; }
    toast.success('Client updated');
    setEditingClient(null);
    fetchClients();
  };

  // ── Import / Export ──────────────────────────────────────────────────────
  const [showImport, setShowImport] = useState(false);

  const handleExportCSV = async () => {
    if (!tenant) return;
    const { data: allClients } = await supabase
      .from('clients')
      .select('id, first_name, last_name, email, phone, notes')
      .eq('tenant_id', tenant.id)
      .order('created_at', { ascending: false });

    if (!allClients || allClients.length === 0) {
      toast.error('No clients to export');
      return;
    }

    // Fetch tag assignments for all clients
    const { data: assignments } = await supabase
      .from('client_tag_assignments')
      .select('client_id, tag_id')
      .in('client_id', allClients.map((c) => c.id));

    const { data: allTags } = await supabase
      .from('client_tags')
      .select('id, name')
      .eq('tenant_id', tenant.id);

    const tagNameMap = new Map((allTags || []).map((t) => [t.id, t.name]));
    const clientTagNames: Record<string, string[]> = {};
    for (const a of assignments || []) {
      if (!clientTagNames[a.client_id]) clientTagNames[a.client_id] = [];
      const name = tagNameMap.get(a.tag_id);
      if (name) clientTagNames[a.client_id].push(name);
    }

    const lines = ['first_name,last_name,email,phone,notes,tags'];
    for (const c of allClients) {
      const tagStr = (clientTagNames[c.id] || []).join(',');
      lines.push([
        escapeCSVField(c.first_name),
        escapeCSVField(c.last_name),
        escapeCSVField(c.email),
        escapeCSVField(c.phone),
        escapeCSVField(c.notes),
        escapeCSVField(tagStr),
      ].join(','));
    }

    const date = new Date().toISOString().slice(0, 10);
    downloadCSV(lines.join('\n'), `sunstone-clients-${date}.csv`);
    toast.success('Clients exported');
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <ClientsHeader
        clientCount={clients.length}
        filteredCount={filteredClients.length}
        isFiltered={selectedTagIds.length > 0}
        canEdit={can('clients:edit')}
        crmEnabled={crmEnabled}
        tenantSlug={tenant?.slug || null}
        onAddClient={() => setShowForm(true)}
        onBroadcast={() => router.push('/dashboard/broadcasts')}
        onImport={() => setShowImport(true)}
        onExport={handleExportCSV}
      />

      {/* Search + Tag Filters */}
      <div className="space-y-2">
        <ClientSearch onSearch={setSearch} />
        {!isStarter && (
          <TagFilterChips
            tags={tags}
            selectedTagIds={selectedTagIds}
            segments={segments}
            activeSegment={activeSegment}
            savingSegment={savingSegment}
            canEdit={can('clients:edit')}
            onToggleTag={toggleTagFilter}
            onClearFilters={() => { setSelectedTagIds([]); setActiveSegment(null); }}
            onSaveSegment={saveAsSegment}
            onApplySegment={applySegment}
            onDeleteSegment={deleteSegment}
            onManageTags={() => setShowTagManager(true)}
          />
        )}
      </div>

      {/* Client List */}
      <ClientList
        clients={filteredClients}
        loading={loading}
        isStarter={isStarter}
        tags={tags}
        clientTagMap={clientTagMap}
        hasFilters={!!search || selectedTagIds.length > 0}
        onOpenProfile={(client) => setProfileClientId(client.id)}
        onAddClient={() => setShowForm(true)}
      />

      {/* CRM Teaser */}
      {isStarter && clients.length > 0 && (
        <UpgradePrompt
          feature="CRM & Marketing Tools"
          description="Tag clients, send SMS and email broadcasts, automate aftercare follow-ups, and nurture new client relationships."
          variant="inline"
        />
      )}

      {/* Client Profile Slide-in */}
      {profileClientId && tenant && (
        <ClientProfile
          clientId={profileClientId}
          tenantId={tenant.id}
          onClose={() => setProfileClientId(null)}
          onEdit={(client) => { setProfileClientId(null); setEditingClient(client); }}
          onTagsChanged={() => { fetchTags(); fetchTagAssignments(); }}
        />
      )}

      {/* Add/Edit Client Modal */}
      {(showForm || editingClient) && (
        <ClientFormModal
          client={editingClient}
          onSave={editingClient ? handleEditClient : handleAddClient}
          onClose={() => { setShowForm(false); setEditingClient(null); }}
        />
      )}

      {/* Tag Manager Modal */}
      {showTagManager && (
        <TagManagerModal
          tenantId={tenant?.id || ''}
          tags={tags}
          onClose={() => setShowTagManager(false)}
          onRefresh={fetchTags}
        />
      )}

      {/* Import Modal */}
      {showImport && tenant && (
        <ImportModal
          mode="clients"
          tenantId={tenant.id}
          onClose={() => setShowImport(false)}
          onComplete={() => { fetchClients(); fetchTags(); fetchTagAssignments(); }}
        />
      )}

      <SunnyTutorial
        pageKey="clients"
        tips={[
          { title: 'Clients are auto-created', body: 'When someone signs a waiver or makes a purchase, they\'re added to your client list automatically.' },
          { title: 'Use tags to organize', body: 'Tag clients as VIP, birthday club, or anything else. Then use tags to send targeted broadcasts.' },
        ]}
      />
    </div>
  );
}
