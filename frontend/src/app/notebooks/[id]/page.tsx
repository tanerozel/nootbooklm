'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Keyboard, RefreshCw, Share2 } from 'lucide-react';

import CitationPreview from '@/components/CitationPreview';
import ChatPanel from '@/components/ChatPanel';
import NotePanel from '@/components/NotePanel';
import ShareModal from '@/components/ShareModal';
import SourcePanel from '@/components/SourcePanel';
import SourceViewer from '@/components/SourceViewer';
import SummaryPanel from '@/components/SummaryPanel';
import { getNotebook, getSource, listSources } from '@/lib/api';
import type { Citation, Notebook, Source } from '@/types';

interface Props {
  params: { id: string };
}

export default function NotebookPage({ params }: Props) {
  const router = useRouter();
  const { id } = params;

  const [notebook, setNotebook] = useState<Notebook | null>(null);
  const [sources, setSources] = useState<Source[]>([]);
  const [selectedSource, setSelectedSource] = useState<Source | null>(null);
  const [activeCitation, setActiveCitation] = useState<Citation | null>(null);
  const [loading, setLoading] = useState(true);
  const [showShareModal, setShowShareModal] = useState(false);
  const [notebookShareToken, setNotebookShareToken] = useState<string | null>(null);
  const [rightTab, setRightTab] = useState<'notes' | 'summary'>('notes');

  const pollingRef = useRef<ReturnType<typeof setInterval>>();

  const fetchData = useCallback(async () => {
    try {
      const [nb, srcs] = await Promise.all([getNotebook(id), listSources(id)]);
      setNotebook(nb);
      setSources(srcs);
      setNotebookShareToken(nb.share_token ?? null);
    } catch {
      router.push('/');
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  const pollSources = useCallback(async () => {
    const processing = sources.filter((s) => s.status === 'pending' || s.status === 'processing');
    if (processing.length === 0) {
      return;
    }

    const updated = await Promise.all(processing.map((s) => getSource(id, s.id).catch(() => s)));
    setSources((prev) => prev.map((s) => updated.find((u) => u.id === s.id) ?? s));
  }, [id, sources]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    clearInterval(pollingRef.current);
    pollingRef.current = setInterval(pollSources, 3000);
    return () => clearInterval(pollingRef.current);
  }, [pollSources]);

  useEffect(() => {
    if (!selectedSource) {
      return;
    }
    const updatedSource = sources.find((source) => source.id === selectedSource.id);
    if (!updatedSource) {
      setSelectedSource(null);
      return;
    }
    if (updatedSource !== selectedSource) {
      setSelectedSource(updatedSource);
    }
  }, [selectedSource, sources]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isEditable = Boolean(
        target &&
          (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      );

      if (event.key === 'Escape') {
        setActiveCitation(null);
        setSelectedSource(null);
        return;
      }

      if (isEditable) {
        return;
      }

      if (event.key === '/') {
        event.preventDefault();
        document.getElementById('chat-input')?.focus();
        return;
      }

      if (event.key.toLowerCase() === 'u') {
        event.preventDefault();
        document.getElementById('source-upload-input')?.click();
        return;
      }

      if (event.key.toLowerCase() === 'n') {
        event.preventDefault();
        setRightTab('notes');
        setActiveCitation(null);
        setSelectedSource(null);
        requestAnimationFrame(() => document.getElementById('note-editor')?.focus());
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const rightPanelContent = activeCitation ? (
    <CitationPreview citation={activeCitation} onClose={() => setActiveCitation(null)} />
  ) : selectedSource ? (
    <SourceViewer notebookId={id} source={selectedSource} onClose={() => setSelectedSource(null)} />
  ) : (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex border-b border-gray-200">
        {(['notes', 'summary'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setRightTab(tab)}
            className={`flex-1 py-2.5 text-xs font-medium uppercase tracking-wide transition ${
              rightTab === tab
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-hidden">
        {rightTab === 'notes' ? <NotePanel notebookId={id} /> : <SummaryPanel notebookId={id} />}
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <RefreshCw className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      <header className="flex items-center gap-4 px-6 py-3 bg-white border-b border-gray-200 shrink-0">
        <button onClick={() => router.push('/')} className="p-1.5 rounded hover:bg-gray-100 text-gray-500">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <h1 className="font-semibold text-gray-900 truncate">{notebook?.title}</h1>
        <div className="ml-auto flex items-center gap-3">
          <button
            onClick={() => setShowShareModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-gray-200 text-xs text-gray-600 hover:bg-gray-50"
          >
            <Share2 className="w-3.5 h-3.5" />
            Share
          </button>
          <div className="hidden md:flex items-center gap-2 rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs text-gray-500">
            <Keyboard className="w-3.5 h-3.5" />
            <span>/ chat</span>
            <span>U upload</span>
            <span>N notes</span>
            <span>Esc close</span>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <aside className="w-64 bg-white border-r border-gray-200 flex flex-col shrink-0 overflow-hidden">
          <SourcePanel
            notebookId={id}
            sources={sources}
            onSourcesChange={setSources}
            onSourceSelect={(source) => {
              setActiveCitation(null);
              setSelectedSource(source);
            }}
            selectedSourceId={selectedSource?.id ?? null}
          />
        </aside>

        <main className="flex-1 flex flex-col overflow-hidden">
          <ChatPanel notebookId={id} onCitationClick={setActiveCitation} />
        </main>

        <aside className="w-72 bg-white border-l border-gray-200 flex flex-col shrink-0 overflow-hidden">
          {rightPanelContent}
        </aside>
      </div>

      {showShareModal && (
        <ShareModal
          notebookId={id}
          existingToken={notebookShareToken}
          onClose={() => setShowShareModal(false)}
          onTokenChange={(token) => setNotebookShareToken(token)}
        />
      )}
    </div>
  );
}
