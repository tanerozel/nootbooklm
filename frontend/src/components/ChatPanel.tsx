'use client';

import { useEffect, useRef, useState } from 'react';
import { Send, Loader2, Trash2 } from 'lucide-react';
import { clearHistory, getChatHistory, sendMessage } from '@/lib/api';
import type { ChatMessage, Citation } from '@/types';
import clsx from 'clsx';

interface Props {
  notebookId: string;
  onCitationClick: (citation: Citation) => void;
}

function CitationBadge({
  citation,
  onClick,
}: {
  citation: Citation;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1 mx-0.5 px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 text-xs font-mono hover:bg-blue-200 transition"
      title={`${citation.source_title}${citation.page_number ? ` p.${citation.page_number}` : ''}`}
    >
      [{citation.source_id.slice(0, 6)}::{citation.chunk_index}]
    </button>
  );
}

function renderContent(content: string, citations: Citation[] | null, onCitationClick: (c: Citation) => void) {
  if (!citations || citations.length === 0) return <span>{content}</span>;

  // Replace citation markers like [uuid::0] with interactive badges
  const parts: React.ReactNode[] = [];
  const pattern = /\[([\w-]+)::(\d+)\]/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push(content.slice(lastIndex, match.index));
    }
    const sourceId = match[1];
    const chunkIndex = parseInt(match[2], 10);
    const citation = citations.find(
      (c) => c.source_id === sourceId && c.chunk_index === chunkIndex
    ) ?? {
      source_id: sourceId,
      source_title: 'Unknown',
      chunk_index: chunkIndex,
      page_number: null,
      text_snippet: '',
    };
    parts.push(
      <CitationBadge
        key={`${sourceId}-${chunkIndex}-${match.index}`}
        citation={citation}
        onClick={() => onCitationClick(citation)}
      />
    );
    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < content.length) {
    parts.push(content.slice(lastIndex));
  }

  return <>{parts}</>;
}

export default function ChatPanel({ notebookId, onCitationClick }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getChatHistory(notebookId)
      .then(setMessages)
      .finally(() => setInitialLoad(false));
  }, [notebookId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = input.trim();
    if (!q || loading) return;

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      notebook_id: notebookId,
      role: 'user',
      content: q,
      citations: null,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const resp = await sendMessage(notebookId, q);
      const assistantMsg: ChatMessage = {
        id: resp.message_id,
        notebook_id: notebookId,
        role: 'assistant',
        content: resp.answer,
        citations: resp.citations,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          notebook_id: notebookId,
          role: 'assistant',
          content: 'Error: could not get a response. Please try again.',
          citations: null,
          created_at: new Date().toISOString(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleClear = async () => {
    if (!confirm('Clear chat history?')) return;
    await clearHistory(notebookId);
    setMessages([]);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <h2 className="font-semibold text-sm text-gray-700 uppercase tracking-wide">Chat</h2>
        {messages.length > 0 && (
          <button
            onClick={handleClear}
            className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-red-500"
            title="Clear history"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {initialLoad ? (
          <div className="flex justify-center pt-8">
            <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center text-gray-400 text-sm py-12">
            Ask a question about your sources.
            <br />
            Every answer will include citations.
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={clsx(
                'flex',
                msg.role === 'user' ? 'justify-end' : 'justify-start'
              )}
            >
              <div
                className={clsx(
                  'max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed',
                  msg.role === 'user'
                    ? 'bg-blue-600 text-white rounded-br-sm'
                    : 'bg-white border border-gray-200 text-gray-800 rounded-bl-sm shadow-sm'
                )}
              >
                {renderContent(msg.content, msg.citations, onCitationClick)}
              </div>
            </div>
          ))
        )}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-white border border-gray-200 rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm">
              <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={handleSend}
        className="px-4 py-3 border-t border-gray-200 flex gap-2"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask a question about your sources…"
          disabled={loading}
          className="flex-1 border border-gray-300 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="bg-blue-600 text-white rounded-xl px-3 py-2 hover:bg-blue-700 disabled:opacity-50 transition"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </form>
    </div>
  );
}
