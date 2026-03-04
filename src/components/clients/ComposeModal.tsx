'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Button, Modal, ModalHeader, ModalBody, ModalFooter } from '@/components/ui';
import { renderTemplate, SAMPLE_VARIABLES } from '@/lib/templates';
import type { MessageTemplate } from '@/types';

interface ComposeModalProps {
  channel: 'sms' | 'email';
  clientId: string;
  clientName: string;
  tenantId: string;
  tenantName: string;
  onClose: () => void;
  onSent: () => void;
}

export default function ComposeModal({
  channel,
  clientId,
  clientName,
  tenantId,
  tenantName,
  onClose,
  onSent,
}: ComposeModalProps) {
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    fetch(`/api/templates?tenantId=${tenantId}&channel=${channel}`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setTemplates);
  }, [tenantId, channel]);

  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplateId(templateId);
    const t = templates.find((tpl) => tpl.id === templateId);
    if (t) {
      setBody(t.body);
      if (t.subject) setSubject(t.subject);
    }
  };

  const sampleVars: Record<string, string> = {
    ...SAMPLE_VARIABLES,
    client_name: clientName,
    client_first_name: clientName.split(' ')[0] || clientName,
    business_name: tenantName || SAMPLE_VARIABLES.business_name,
  };
  const preview = renderTemplate(body, sampleVars);

  const handleSend = async () => {
    if (!body.trim()) {
      toast.error('Enter a message');
      return;
    }
    if (channel === 'email' && !subject.trim()) {
      toast.error('Enter a subject line');
      return;
    }

    setSending(true);
    try {
      const res = await fetch('/api/clients/send-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId,
          clientId,
          channel,
          subject: channel === 'email' ? subject : undefined,
          message: body,
        }),
      });

      if (res.ok) {
        toast.success(channel === 'sms' ? 'SMS sent' : 'Email sent');
        onSent();
      } else {
        const err = await res.json();
        toast.error(err.error || 'Failed to send');
      }
    } catch {
      toast.error('Failed to send message');
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal isOpen={true} onClose={onClose} size="lg">
      <ModalHeader>
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">
          {channel === 'sms' ? 'Send SMS' : 'Send Email'} to {clientName}
        </h2>
      </ModalHeader>
      <ModalBody>
        <div className="space-y-4">
          {/* Template picker */}
          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">
              Start from template
            </label>
            <select
              value={selectedTemplateId}
              onChange={(e) => handleTemplateSelect(e.target.value)}
              className="w-full min-h-[40px] px-3 text-sm border border-[var(--border-default)] rounded-lg bg-[var(--surface-raised)] text-[var(--text-primary)]"
            >
              <option value="">Custom message...</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>

          {/* Subject (email only) */}
          {channel === 'email' && (
            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">
                Subject
              </label>
              <input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Subject line..."
                className="w-full px-3 py-2.5 text-sm border border-[var(--border-default)] rounded-lg bg-[var(--surface-raised)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-subtle)]"
              />
            </div>
          )}

          {/* Message body */}
          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">
              Message
            </label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={channel === 'sms' ? 4 : 8}
              maxLength={channel === 'sms' ? 1600 : 50000}
              className="w-full px-3 py-2.5 text-sm border border-[var(--border-default)] rounded-lg bg-[var(--surface-raised)] text-[var(--text-primary)] resize-y min-h-[80px] focus:outline-none focus:ring-2 focus:ring-[var(--accent-subtle)]"
              placeholder={`Type your message... Variables like {{client_name}} and {{business_name}} will be replaced.`}
            />
            <span className={`text-xs font-medium ${
              channel === 'sms'
                ? (body.length <= 160 ? 'text-success-600' : body.length <= 320 ? 'text-warning-600' : 'text-error-600')
                : (body.length <= 40000 ? 'text-[var(--text-tertiary)]' : 'text-error-600')
            }`}>
              {body.length.toLocaleString()} / {channel === 'sms' ? '1,600' : '50,000'}
            </span>
          </div>

          {/* Preview */}
          {body && (
            <div>
              <label className="block text-xs font-medium text-[var(--text-tertiary)] mb-1.5">
                Preview
              </label>
              <div className="border border-[var(--border-default)] rounded-xl bg-[var(--surface-subtle)] p-4">
                {channel === 'sms' ? (
                  <div className="max-w-[280px]">
                    <div className="rounded-2xl rounded-bl-sm px-4 py-3 text-sm leading-relaxed" style={{ backgroundColor: '#F0F0F0', color: '#1A1A1A' }}>
                      {preview}
                    </div>
                  </div>
                ) : (
                  <div className="bg-[var(--surface-raised)] rounded-lg border border-[var(--border-default)] overflow-hidden">
                    {subject && (
                      <div className="px-4 py-3 border-b border-[var(--border-default)]">
                        <p className="text-sm font-medium text-[var(--text-primary)]">
                          {renderTemplate(subject, sampleVars)}
                        </p>
                      </div>
                    )}
                    <div className="px-4 py-4 text-sm text-[var(--text-secondary)] whitespace-pre-wrap leading-relaxed">
                      {preview}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </ModalBody>
      <ModalFooter>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={handleSend} loading={sending} disabled={!body.trim()}>
          {channel === 'sms' ? 'Send SMS' : 'Send Email'}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
