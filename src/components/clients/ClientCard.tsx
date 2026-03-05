'use client';

import { getTagColor } from '@/lib/tag-colors';
import type { Client, ClientTag } from '@/types';

interface TagWithCount extends ClientTag {
  usage_count: number;
}

interface ClientCardProps {
  client: Client;
  clientTags: TagWithCount[];
  isStarter: boolean;
  totalSpent?: number;
  hasSuggestion?: boolean;
  onOpenProfile: () => void;
}

export default function ClientCard({
  client,
  clientTags,
  isStarter,
  totalSpent,
  hasSuggestion,
  onOpenProfile,
}: ClientCardProps) {
  const initials = `${(client.first_name?.[0] || '').toUpperCase()}${(client.last_name?.[0] || '').toUpperCase()}`;
  const maxVisibleTags = 2;
  const visibleTags = clientTags.slice(0, maxVisibleTags);
  const extraCount = clientTags.length - maxVisibleTags;

  return (
    <div
      className="bg-[var(--surface-raised)] border border-[var(--border-default)] rounded-xl px-3 py-2.5 mb-1.5 cursor-pointer flex items-center gap-2.5 hover:border-[var(--accent-200)] transition-colors"
      style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}
      onClick={onOpenProfile}
    >
      {/* Avatar */}
      <div className="relative flex-shrink-0">
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center"
          style={{ backgroundColor: 'var(--accent-muted)' }}
        >
          <span className="text-xs font-semibold" style={{ color: 'var(--accent-primary)' }}>
            {initials}
          </span>
        </div>
        {(client.unread_messages || 0) > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
            {client.unread_messages > 9 ? '9+' : client.unread_messages}
          </span>
        )}
      </div>

      {/* Middle content */}
      <div className="flex-1 min-w-0">
        {/* Top line: name + total spent */}
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-[var(--text-primary)] truncate">
            {client.first_name} {client.last_name}
          </span>
          {totalSpent !== undefined && totalSpent > 0 && (
            <span className="text-[10px] font-semibold text-[var(--text-primary)] flex-shrink-0">
              ${totalSpent.toFixed(0)}
            </span>
          )}
        </div>

        {/* Bottom line: tags + suggestion dot */}
        <div className="flex items-center gap-1 mt-0.5">
          {!isStarter && visibleTags.map((tag) => {
            const colors = getTagColor(tag.color);
            return (
              <span
                key={tag.id}
                className="inline-flex items-center px-1.5 py-0 rounded-full text-[9px] font-semibold"
                style={{ backgroundColor: colors.bg, color: colors.text }}
              >
                {tag.name}
              </span>
            );
          })}
          {!isStarter && extraCount > 0 && (
            <span className="text-[9px] font-semibold text-[var(--text-tertiary)]">
              +{extraCount}
            </span>
          )}
          {hasSuggestion && (
            <div
              className="w-1.5 h-1.5 rounded-full ml-auto flex-shrink-0"
              style={{ backgroundColor: 'var(--accent-primary)' }}
            />
          )}
        </div>
      </div>

      {/* Chevron */}
      <svg
        className="w-3.5 h-3.5 text-[var(--text-tertiary)] flex-shrink-0"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
      </svg>
    </div>
  );
}
