'use client';

import { useState } from 'react';
import { Button, Card, CardContent, Skeleton } from '@/components/ui';
import ClientCard from './ClientCard';
import type { Client, ClientTag } from '@/types';

interface TagWithCount extends ClientTag {
  usage_count: number;
}

type SortField = 'name' | 'last_visit' | 'created';

type ClientTagMap = Record<string, string[]>;

interface ClientListProps {
  clients: Client[];
  loading: boolean;
  isStarter: boolean;
  tags: TagWithCount[];
  clientTagMap: ClientTagMap;
  clientSpendMap?: Record<string, number>;
  suggestionClientIds?: Set<string>;
  hasFilters: boolean;
  onOpenProfile: (client: Client) => void;
  onAddClient: () => void;
}

export default function ClientList({
  clients,
  loading,
  isStarter,
  tags,
  clientTagMap,
  clientSpendMap,
  suggestionClientIds,
  hasFilters,
  onOpenProfile,
  onAddClient,
}: ClientListProps) {
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortAsc, setSortAsc] = useState(true);

  const getTag = (id: string) => tags.find((t) => t.id === id);

  const sortedClients = [...clients].sort((a, b) => {
    let cmp = 0;
    if (sortField === 'name') {
      const nameA = `${a.first_name || ''} ${a.last_name || ''}`.toLowerCase();
      const nameB = `${b.first_name || ''} ${b.last_name || ''}`.toLowerCase();
      cmp = nameA.localeCompare(nameB);
    } else if (sortField === 'last_visit') {
      const dateA = a.last_visit_at ? new Date(a.last_visit_at).getTime() : 0;
      const dateB = b.last_visit_at ? new Date(b.last_visit_at).getTime() : 0;
      cmp = dateA - dateB;
    } else {
      cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    }
    return sortAsc ? cmp : -cmp;
  });

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <Card key={i} padding="sm">
            <CardContent className="p-4 flex items-center gap-4">
              <Skeleton className="w-10 h-10 rounded-full shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-36" />
                <Skeleton className="h-3 w-48" />
              </div>
              <Skeleton className="h-6 w-16 rounded-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (clients.length === 0) {
    return (
      <Card padding="lg">
        <CardContent>
          <div className="text-center py-8">
            <p className="text-[var(--text-tertiary)] mb-4">
              {hasFilters ? 'No clients found' : 'No clients yet'}
            </p>
            {!hasFilters && (
              <Button variant="primary" onClick={onAddClient}>
                Add Your First Client
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div>
      {/* Sort controls */}
      <div className="flex items-center gap-3 text-[10px] text-[var(--text-tertiary)] mb-2">
        <span>Sort:</span>
        {([
          { field: 'name' as SortField, label: 'Name' },
          { field: 'last_visit' as SortField, label: 'Last Visit' },
          { field: 'created' as SortField, label: 'Date Added' },
        ]).map(({ field, label }) => (
          <button
            key={field}
            onClick={() => handleSort(field)}
            className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
              sortField === field
                ? 'text-[var(--text-primary)] bg-[var(--surface-subtle)]'
                : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
            }`}
          >
            {label}
            {sortField === field && (
              <span className="ml-0.5">{sortAsc ? '\u2191' : '\u2193'}</span>
            )}
          </button>
        ))}
      </div>

      {/* Client cards */}
      <div>
        {sortedClients.map((client) => {
          const clientTagIds = clientTagMap[client.id] || [];
          const clientTags = clientTagIds.map(getTag).filter(Boolean) as TagWithCount[];
          return (
            <ClientCard
              key={client.id}
              client={client}
              clientTags={clientTags}
              isStarter={isStarter}
              totalSpent={clientSpendMap?.[client.id]}
              hasSuggestion={suggestionClientIds?.has(client.id)}
              onOpenProfile={() => onOpenProfile(client)}
            />
          );
        })}
      </div>
    </div>
  );
}
