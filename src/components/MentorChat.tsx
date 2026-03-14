// ============================================================================
// MentorChat — GATED — src/components/MentorChat.tsx
// ============================================================================
// Floating "Ask Sunny" button + slide-in chat panel
// GATE: Starter tier shows remaining question count, upgrade prompt at limit
// Handles 429 response from mentor API gracefully
// ============================================================================

'use client';

import { useState, useRef, useEffect, useCallback, type KeyboardEvent } from 'react';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useTenant } from '@/hooks/use-tenant';
import { getSubscriptionTier, getSunnyQuestionLimit } from '@/lib/subscription';
import UpgradePrompt from '@/components/ui/UpgradePrompt';
import { toast } from 'sonner';
import { ThumbsDown } from 'lucide-react';

// Compute luminance from a hex color (0 = black, 1 = white)
function getLuminance(hex: string): number {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

// Compute contrast text color based on background luminance
function getContrastTextColor(bgHex: string): string {
  return getLuminance(bgHex) > 0.55 ? '#1A1A1A' : '#FFFFFF';
}

// ============================================================================
// Types
// ============================================================================

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  products?: Product[];
  isStreaming?: boolean;
  toolStatus?: string;
}

interface Product {
  id: string;
  title: string;
  handle: string;
  description: string;
  price: string;
  imageUrl: string | null;
  imageAlt: string;
  url: string;
  available: boolean;
}

// ============================================================================
// Suggested prompts
// ============================================================================

const SUGGESTED_PROMPTS = [
  'Check my inventory levels',
  'Show me my revenue this month',
  'How did my last event perform?',
  'How should I price my services?',
  'Help me plan for my first event',
  'What settings for gold fill on Zapp Plus?',
];

// ============================================================================
// Assistant bubble colors are driven by CSS custom properties:
//   --mentor-bubble-bg, --mentor-bubble-text, --mentor-bubble-bold,
//   --mentor-bubble-link, --mentor-bubble-code-bg, --mentor-bubble-border,
//   --mentor-bubble-dot, --mentor-bubble-status
// Set per light/dark in globals.css (:root defaults) and theme.ts (applyTheme).
// ============================================================================

// ============================================================================
// Simple markdown renderer (no external dependency)
// ============================================================================

function renderMarkdown(text: string): string {
  const t = 'var(--mentor-bubble-text)';
  const b = 'var(--mentor-bubble-bold)';
  const l = 'var(--mentor-bubble-link)';
  const c = 'var(--mentor-bubble-code-bg)';
  let html = text.replace(/<!--[\s\S]*?-->/g, '');
  html = html
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  // Inline code
  html = html.replace(/`([^`]+)`/g,
    `<code style="background:${c};color:${t};padding:1px 5px;border-radius:3px;font-size:0.8em;">$1</code>`);
  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g,
    `<strong style="color:${b};font-weight:600;">$1</strong>`);
  // Italic
  html = html.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g,
    `<em style="color:${t};">$1</em>`);
  // Headings
  html = html.replace(/^### (.+)$/gm,
    `<h4 style="color:${b};font-weight:600;font-size:0.875rem;margin:12px 0 4px;">$1</h4>`);
  html = html.replace(/^## (.+)$/gm,
    `<h3 style="color:${b};font-weight:600;font-size:0.875rem;margin:12px 0 4px;">$1</h3>`);
  // Ordered list items
  html = html.replace(/^(\d+)\.\s+(.+)$/gm,
    `<li style="color:${t};margin-left:16px;list-style-type:decimal;font-size:0.875rem;line-height:1.625;">$2</li>`);
  // Unordered list items
  html = html.replace(/^[-•]\s+(.+)$/gm,
    `<li style="color:${t};margin-left:16px;list-style-type:disc;font-size:0.875rem;line-height:1.625;">$1</li>`);
  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g,
    `<a href="$2" target="_blank" rel="noopener noreferrer" style="color:${l};text-decoration:underline;">$1</a>`);
  // Paragraphs
  html = html.replace(/\n\n/g,
    `</p><p style="color:${t};font-size:0.875rem;line-height:1.625;margin-bottom:8px;">`);
  html = html.replace(/\n/g, '<br>');
  if (!html.startsWith('<')) {
    html = `<p style="color:${t};font-size:0.875rem;line-height:1.625;margin-bottom:8px;">${html}</p>`;
  }
  return html;
}

// ============================================================================
// Main component
// ============================================================================

interface MentorChatProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function MentorChat({ isOpen, onClose }: MentorChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [hasBeenOpened, setHasBeenOpened] = useState(false);
  const [limitReached, setLimitReached] = useState(false);
  const [questionsUsed, setQuestionsUsed] = useState(0);
  const [flaggedMessages, setFlaggedMessages] = useState<Set<string>>(new Set());
  const [flagModalMsg, setFlagModalMsg] = useState<ChatMessage | null>(null);

  const pathname = usePathname();
  const { tenant } = useTenant();
  const effectiveTier = tenant ? getSubscriptionTier(tenant) : 'starter';
  const questionLimit = getSunnyQuestionLimit(effectiveTier);
  const isMetered = effectiveTier === 'starter' && questionLimit !== Infinity;
  const [userBubbleTextColor, setUserBubbleTextColor] = useState('#FFFFFF');

  // Compute user bubble text color from accent luminance
  useEffect(() => {
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent-500').trim();
    if (accent) setUserBubbleTextColor(getContrastTextColor(accent));
  }, [tenant?.theme_id]);

  // Initialize questions used from tenant data
  useEffect(() => {
    if (tenant && isMetered) {
      setQuestionsUsed(tenant.sunny_questions_used || 0);

      // Check if reset is needed (30 days)
      const resetAt = tenant.sunny_questions_reset_at
        ? new Date(tenant.sunny_questions_reset_at)
        : null;
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      if (!resetAt || resetAt < thirtyDaysAgo) {
        setQuestionsUsed(0);
      }

      // Check if already at limit
      const used = tenant.sunny_questions_used || 0;
      if (used >= questionLimit && resetAt && resetAt >= thirtyDaysAgo) {
        setLimitReached(true);
      }
    }
  }, [tenant, isMetered, questionLimit]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Restore focus to input after streaming completes or flag modal closes
  useEffect(() => {
    if (!isLoading && !flagModalMsg && isOpen) {
      // Use requestAnimationFrame to wait for the render cycle to complete
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [isLoading, flagModalMsg, isOpen]);

  useEffect(() => {
    if (isOpen) {
      setHasBeenOpened(true);
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // ============================================================================
  // Send message
  // ============================================================================

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim() || isLoading || limitReached) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: content.trim(),
    };

    const assistantMsg: ChatMessage = {
      id: `assistant-${Date.now()}`,
      role: 'assistant',
      content: '',
      isStreaming: true,
    };

    const apiMessages = [...messages, userMsg].map(m => ({
      role: m.role,
      content: m.content,
    }));

    setMessages(prev => [...prev, userMsg, assistantMsg]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/mentor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: apiMessages, currentPage: pathname }),
      });

      // Handle 429 — question limit reached
      if (response.status === 429) {
        const errorData = await response.json();
        setLimitReached(true);
        setQuestionsUsed(errorData.questions_used || questionLimit);
        setMessages(prev =>
          prev.map(m =>
            m.id === assistantMsg.id
              ? {
                  ...m,
                  content: errorData.message || "You've reached your question limit this month. Upgrade to Pro for unlimited Sunny access.",
                  isStreaming: false,
                }
              : m
          )
        );
        setIsLoading(false);
        return;
      }

      if (!response.ok) {
        let errorDetail = `Status ${response.status}`;
        try {
          const errBody = await response.json();
          errorDetail = errBody.error || errorDetail;
        } catch { /* ignore */ }
        console.error('[MentorChat] API error:', errorDetail);
        throw new Error(errorDetail);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No reader');

      const decoder = new TextDecoder();
      let fullText = '';
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);
              if (parsed.toolStatus) {
                setMessages(prev =>
                  prev.map(m =>
                    m.id === assistantMsg.id
                      ? { ...m, toolStatus: parsed.toolStatus }
                      : m
                  )
                );
              }
              if (parsed.text) {
                fullText += parsed.text;
                setMessages(prev =>
                  prev.map(m =>
                    m.id === assistantMsg.id
                      ? { ...m, content: fullText, isStreaming: true, toolStatus: undefined }
                      : m
                  )
                );
              }
            } catch {
              // Skip
            }
          }
        }
      }

      // Increment local counter for Starter users
      if (isMetered) {
        setQuestionsUsed(prev => {
          const newCount = prev + 1;
          if (newCount >= questionLimit) {
            setLimitReached(true);
          }
          return newCount;
        });
      }

      // Check for product search marker
      const productMatch = fullText.match(/<!--\s*PRODUCT_SEARCH:\s*(.+?)\s*-->/);
      let products: Product[] = [];

      if (productMatch) {
        try {
          const searchQuery = productMatch[1].trim();
          const productRes = await fetch('/api/mentor/products', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: searchQuery }),
          });
          const productData = await productRes.json();
          products = productData.products || [];
        } catch (err) {
          console.error('[MentorChat] Product search error:', err);
        }
      }

      // Clean markers and finalize
      const cleanText = fullText
        .replace(/<!--\s*PRODUCT_SEARCH:[\s\S]*?-->/g, '')
        .replace(/<!--\s*KNOWLEDGE_GAP:[\s\S]*?-->/g, '')
        .trim();

      setMessages(prev =>
        prev.map(m =>
          m.id === assistantMsg.id
            ? { ...m, content: cleanText, isStreaming: false, products: products.length > 0 ? products : undefined }
            : m
        )
      );
    } catch (error: any) {
      console.error('[MentorChat] Error:', error);
      // Show the actual error instead of a generic message
      let errorMessage: string;
      if (error?.message && error.message !== 'No reader' && error.message !== 'Failed to fetch') {
        errorMessage = `Something went wrong: ${error.message}`;
      } else {
        errorMessage = "Couldn't reach Sunny right now — check your internet connection and try again. If this keeps happening, contact Sunstone support at 385-999-5240.";
      }
      setMessages(prev =>
        prev.map(m =>
          m.id === assistantMsg.id
            ? { ...m, content: errorMessage, isStreaming: false }
            : m
        )
      );
    } finally {
      setIsLoading(false);
    }
  }, [messages, isLoading, limitReached, isMetered, questionLimit]);

  // ============================================================================
  // Keyboard handler
  // ============================================================================

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  // ============================================================================
  // Render
  // ============================================================================

  const questionsRemaining = Math.max(0, questionLimit - questionsUsed);

  return (
    <>
      {/* ── Backdrop (mobile) ── */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/20 z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* ── Chat Panel ── */}
      <div
        className={cn(
          'fixed z-50 flex flex-col bg-[var(--surface-base)] shadow-2xl transition-transform duration-300 ease-in-out',
          'lg:right-0 lg:top-0 lg:bottom-0 lg:w-[400px] lg:border-l lg:border-border-default',
          'max-lg:left-0 max-lg:right-0 max-lg:bottom-0 max-lg:rounded-t-2xl max-lg:max-h-[calc(100vh-60px)]',
          isOpen
            ? 'translate-y-0 lg:translate-x-0'
            : 'translate-y-full lg:translate-y-0 lg:translate-x-full'
        )}
        style={{ minHeight: isOpen ? '50vh' : 0 }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-default shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-sm">
              <SparkleIcon className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2
                className="text-base font-semibold text-text-primary"
                style={{ fontFamily: 'var(--font-display, Fraunces, serif)' }}
              >
                Sunny
              </h2>
              <p className="text-[11px] text-text-secondary leading-none">Your PJ Mentor</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Question counter for Starter users */}
            {isMetered && (
              <span className="text-[11px] text-text-tertiary tabular-nums">
                {questionsRemaining} of {questionLimit} left
              </span>
            )}
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-surface-raised transition-colors text-text-secondary hover:text-text-primary"
              aria-label="Close chat"
            >
              <CloseIcon className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
          {messages.length === 0 ? (
            <EmptyState onSelectPrompt={sendMessage} />
          ) : (
            <>
              {messages.map((msg, idx) => (
                <MessageBubble
                  key={msg.id}
                  message={msg}
                  userBubbleTextColor={userBubbleTextColor}
                  isFlagged={flaggedMessages.has(msg.id)}
                  onFlag={msg.role === 'assistant' && !msg.isStreaming && msg.content ? () => setFlagModalMsg(msg) : undefined}
                />
              ))}
              {isLoading && messages[messages.length - 1]?.content === '' && (
                messages[messages.length - 1]?.toolStatus
                  ? <ToolStatusIndicator status={messages[messages.length - 1].toolStatus!} />
                  : <TypingIndicator />
              )}
            </>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input area — or upgrade prompt if limit reached */}
        {limitReached ? (
          <div className="p-3 border-t border-border-default shrink-0 bg-[var(--surface-base)] safe-area-bottom">
            <UpgradePrompt
              feature="Unlimited Sunny Access"
              variant="inline"
              description="You've used all 5 questions this month. Upgrade to Pro for unlimited conversations with Sunny."
            />
          </div>
        ) : (
          <div className="p-3 pb-4 border-t border-border-default shrink-0 bg-[var(--surface-base)] safe-area-bottom">
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => {
                  setInput(e.target.value);
                  // Auto-expand: reset height then set to scrollHeight (up to max)
                  const el = e.target;
                  el.style.height = 'auto';
                  el.style.height = Math.min(el.scrollHeight, 120) + 'px';
                }}
                onKeyDown={handleKeyDown}
                placeholder="Ask me anything about PJ..."
                className="flex-1 resize-none rounded-xl border border-[var(--border-default)] bg-[var(--surface-raised)] px-3 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-accent-500/30 focus:border-accent-500 transition-all"
                rows={1}
                disabled={isLoading}
                style={{ maxHeight: 120 }}
              />
              <button
                onClick={() => sendMessage(input)}
                disabled={!input.trim() || isLoading}
                className={cn(
                  'flex items-center justify-center w-10 h-10 rounded-xl transition-all shrink-0',
                  input.trim() && !isLoading
                    ? 'bg-accent-500 text-white hover:bg-accent-600 shadow-sm'
                    : 'bg-surface-raised text-text-tertiary cursor-not-allowed'
                )}
                aria-label="Send message"
              >
                <SendIcon className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Flag modal */}
      {flagModalMsg && (
        <FlagModal
          message={flagModalMsg}
          contextMessage={(() => {
            const idx = messages.findIndex(m => m.id === flagModalMsg.id);
            for (let i = idx - 1; i >= 0; i--) {
              if (messages[i].role === 'user') return messages[i].content;
            }
            return undefined;
          })()}
          onClose={() => setFlagModalMsg(null)}
          onSubmit={async (note) => {
            const idx = messages.findIndex(m => m.id === flagModalMsg.id);
            let context: string | undefined;
            for (let i = idx - 1; i >= 0; i--) {
              if (messages[i].role === 'user') { context = messages[i].content; break; }
            }
            try {
              const res = await fetch('/api/mentor/flag', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  flaggedMessage: flagModalMsg.content,
                  conversationContext: context,
                  userNote: note || undefined,
                  source: 'user_thumbs_down',
                }),
              });
              if (res.ok) {
                setFlaggedMessages(prev => new Set(prev).add(flagModalMsg.id));
                toast.success('Thanks for the feedback! We\'ll review this.');
              } else {
                toast.error('Could not submit feedback — try again.');
              }
            } catch {
              toast.error('Could not submit feedback — try again.');
            }
            setFlagModalMsg(null);
          }}
        />
      )}
    </>
  );
}

// ============================================================================
// Flag modal
// ============================================================================

function FlagModal({
  message,
  contextMessage,
  onClose,
  onSubmit,
}: {
  message: ChatMessage;
  contextMessage?: string;
  onClose: () => void;
  onSubmit: (note: string) => void;
}) {
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  return (
    <div className="fixed inset-0 z-[60] flex items-end lg:items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div
        className="relative bg-[var(--surface-raised)] rounded-t-2xl lg:rounded-2xl w-full lg:w-[360px] max-w-md p-5 shadow-xl border border-[var(--border-default)]"
        style={{ maxHeight: '80vh' }}
      >
        <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-3">
          Was this answer wrong or unhelpful?
        </h3>
        <div className="bg-[var(--surface-subtle)] rounded-lg p-3 mb-3 max-h-24 overflow-y-auto">
          <p className="text-xs text-[var(--text-secondary)] line-clamp-4">{message.content}</p>
        </div>
        <textarea
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="What was incorrect? (optional)"
          rows={3}
          className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--surface-base)] px-3 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-accent-500/30 focus:border-accent-500 transition-all resize-none mb-4"
        />
        <div className="flex gap-2">
          <button
            onClick={async () => {
              setSubmitting(true);
              await onSubmit(note);
            }}
            disabled={submitting}
            className="flex-1 px-4 py-2.5 bg-error-500 text-white text-sm font-medium rounded-xl hover:bg-error-600 disabled:opacity-50 transition-colors"
            style={{ minHeight: 48 }}
          >
            {submitting ? 'Submitting…' : 'Submit'}
          </button>
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 text-sm font-medium text-[var(--text-secondary)] border border-[var(--border-default)] rounded-xl hover:bg-[var(--surface-subtle)] transition-colors"
            style={{ minHeight: 48 }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Empty state
// ============================================================================

function EmptyState({ onSelectPrompt }: { onSelectPrompt: (text: string) => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-4 py-8">
      <div className="w-16 h-16 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center mb-4 shadow-lg">
        <SparkleIcon className="w-8 h-8 text-white" />
      </div>
      <h3
        className="text-lg font-semibold text-text-primary mb-1"
        style={{ fontFamily: 'var(--font-display, Fraunces, serif)' }}
      >
        Hey there! I&apos;m Sunny
      </h3>
      <p className="text-sm text-text-secondary mb-6 max-w-xs">
        Your permanent jewelry mentor. Ask me about welding, business, marketing, pricing — anything PJ!
      </p>
      <div className="flex flex-wrap gap-2 justify-center max-w-sm">
        {SUGGESTED_PROMPTS.map((prompt, i) => (
          <button
            key={i}
            onClick={() => onSelectPrompt(prompt)}
            className="px-3 py-2 rounded-full text-xs font-medium border border-border-default text-text-secondary hover:text-accent-600 hover:border-accent-300 hover:bg-accent-50 transition-all"
          >
            {prompt}
          </button>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Message bubble
// ============================================================================

function MessageBubble({ message, userBubbleTextColor, isFlagged, onFlag }: {
  message: ChatMessage;
  userBubbleTextColor: string;
  isFlagged?: boolean;
  onFlag?: () => void;
}) {
  const isUser = message.role === 'user';

  return (
    <div className={cn('flex group', isUser ? 'justify-end' : 'justify-start')}>
      <div className="flex flex-col max-w-[85%] gap-1.5">
        {isUser ? (
          <div
            className="bg-accent-500 px-3.5 py-2.5 text-sm"
            style={{ borderRadius: '16px 16px 4px 16px', color: userBubbleTextColor }}
          >
            <p style={{ fontSize: '0.875rem', lineHeight: '1.625', whiteSpace: 'pre-wrap' }}>
              {message.content}
            </p>
          </div>
        ) : (
          <div
            style={{
              borderRadius: '16px 16px 16px 4px',
              padding: '10px 14px',
              backgroundColor: 'var(--mentor-bubble-bg)',
              color: 'var(--mentor-bubble-text)',
              border: '1px solid var(--mentor-bubble-border)',
            }}
          >
            <div
              dangerouslySetInnerHTML={{ __html: renderMarkdown(message.content) }}
            />
            {message.isStreaming && message.content && (
              <span className="inline-block w-1.5 h-4 bg-accent-500 ml-0.5 animate-pulse rounded-sm" />
            )}
          </div>
        )}

        {/* Thumbs-down flag button on assistant messages */}
        {onFlag && (
          <div className="flex justify-start">
            <button
              onClick={isFlagged ? undefined : onFlag}
              disabled={isFlagged}
              className={cn(
                'flex items-center justify-center rounded-lg transition-all duration-150',
                isFlagged
                  ? 'text-[var(--text-tertiary)] cursor-default opacity-100'
                  : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] opacity-100 sm:opacity-0 sm:group-hover:opacity-100 cursor-pointer'
              )}
              style={{ minHeight: 44, minWidth: 44 }}
              aria-label={isFlagged ? 'Flagged as wrong' : 'Flag as wrong'}
              tabIndex={-1}
            >
              <ThumbsDown size={16} fill={isFlagged ? 'currentColor' : 'none'} />
            </button>
          </div>
        )}

        {/* Product cards */}
        {message.products && message.products.length > 0 && (
          <ProductCarousel products={message.products} />
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Typing indicator
// ============================================================================

function TypingIndicator() {
  return (
    <div className="flex justify-start">
      <div
        style={{
          borderRadius: '16px 16px 16px 4px',
          padding: '12px 16px',
          backgroundColor: 'var(--mentor-bubble-bg)',
          border: '1px solid var(--mentor-bubble-border)',
        }}
      >
        <div className="flex gap-1.5 items-center">
          <span className="w-2 h-2 rounded-full animate-bounce" style={{ animationDelay: '0ms', backgroundColor: 'var(--mentor-bubble-dot)' }} />
          <span className="w-2 h-2 rounded-full animate-bounce" style={{ animationDelay: '150ms', backgroundColor: 'var(--mentor-bubble-dot)' }} />
          <span className="w-2 h-2 rounded-full animate-bounce" style={{ animationDelay: '300ms', backgroundColor: 'var(--mentor-bubble-dot)' }} />
        </div>
      </div>
    </div>
  );
}

function ToolStatusIndicator({ status }: { status: string }) {
  return (
    <div className="flex justify-start">
      <div
        style={{
          borderRadius: '16px 16px 16px 4px',
          padding: '12px 16px',
          backgroundColor: 'var(--mentor-bubble-bg)',
          border: '1px solid var(--mentor-bubble-border)',
        }}
      >
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-accent-500" />
          </span>
          <span className="text-xs" style={{ color: 'var(--mentor-bubble-status)' }}>{status}</span>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Product carousel
// ============================================================================

function ProductCarousel({ products }: { products: Product[] }) {
  return (
    <div className="overflow-x-auto pb-1 -mx-1 px-1">
      <div className="flex gap-2" style={{ minWidth: 'min-content' }}>
        {products.map(product => (
          <a
            key={product.id}
            href={product.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-shrink-0 w-36 rounded-xl border border-border-default bg-[var(--surface-raised)] hover:shadow-md transition-shadow overflow-hidden group"
          >
            {product.imageUrl ? (
              <div className="w-full h-24 bg-surface-raised overflow-hidden">
                <img
                  src={product.imageUrl}
                  alt={product.imageAlt}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                  loading="lazy"
                />
              </div>
            ) : (
              <div className="w-full h-24 bg-surface-raised flex items-center justify-center">
                <ShoppingBagIcon className="w-8 h-8 text-text-tertiary" />
              </div>
            )}
            <div className="p-2">
              <p className="text-xs font-medium text-text-primary line-clamp-2 leading-tight mb-1">
                {product.title}
              </p>
              <p className="text-xs font-semibold text-accent-600">{product.price}</p>
              <p className="text-[10px] text-accent-500 mt-1 group-hover:underline">View →</p>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Icons (inline SVGs)
// ============================================================================

function SparkleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 2L14.09 8.26L20 9.27L15.55 13.97L16.91 20L12 16.9L7.09 20L8.45 13.97L4 9.27L9.91 8.26L12 2Z" />
    </svg>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function SendIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
    </svg>
  );
}

function ShoppingBagIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007zM8.625 10.5a.375.375 0 11-.75 0 .375.375 0 01.75 0zm7.5 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
    </svg>
  );
}

