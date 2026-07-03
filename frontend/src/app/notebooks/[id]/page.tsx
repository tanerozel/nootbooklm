'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { getNotebook, listSources, getSource } from '@/lib/api';
import type { Notebook, Source, Citation } from '@/types';
import SourcePanel from '@/components/SourcePanel';
import ChatPanel from '@/components/ChatPanel';
import NotePanel from '@/components/NotePanel';
import CitationPreview from '@/components/CitationPreview';

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

  const pollingRef = useRef<ReturnType<typeof setInterval>>();

  const fetchData = async () => {
    try {
      const [nb, srcs] = await Promise.all([getNotebook(id), listSources(id)]);
      setNotebook(nb);
      setSources(srcs);
    } catch {
      router.push('/');
    } finally {
      setLoading(false);
    }
  };

  // Poll processing sources every 3s
  const pollSources = async () => {
    const processing = sources.filter((s) => s.status === 'pending' || s.status === 'processing');
    if (processing.length === 0) return;

    const updated = await Promise.all(
      processing.map((s) => getSource(id, s.id).catch(() => s))
    );
    setSources((prev) =>
      prev.map((s) => updated.find((u) => u.id === s.id) ?? s)
    );
  };

  useEffect(() => {
    fetchData();
  }, [id]);

  useEffect(() => {
    pollingRef.current = setInterval(pollSources, 3000);
    return () => clearInterval(pollingRef.current);
  }, [sources]);

  const rightPanelContent = activeCitation ? (
    <CitationPreview citation={activeCitation} onClose={() => setActiveCitation(null)} />
  ) : (
    <NotePanel notebookId={id} />
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
      {/* Header */}
      <header className="flex items-center gap-4 px-6 py-3 bg-white border-b border-gray-200 shrink-0">
        <button
          onClick={() => router.push('/')}
          className="p-1.5 rounded hover:bg-gray-100 text-gray-500"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <h1 className="font-semibold text-gray-900 truncate">{notebook?.title}</h1>
      </header>

      {/* Three-panel layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Sources */}
        <aside className="w-64 bg-white border-r border-gray-200 flex flex-col shrink-0 overflow-hidden">
          <SourcePanel
            notebookId={id}
            sources={sources}
            onSourcesChange={setSources}
            onSourceSelect={setSelectedSource}
            selectedSourceId={selectedSource?.id ?? null}
          />
        </aside>

        {/* Center: Chat */}
        <main className="flex-1 flex flex-col overflow-hidden">
          <ChatPanel notebookId={id} onCitationClick={setActiveCitation} />
        </main>

        {/* Right: Notes / Citation preview */}
        <aside className="w-72 bg-white border-l border-gray-200 flex flex-col shrink-0 overflow-hidden">
          {rightPanelContent}
        </aside>
      </div>
    </div>
  );
}
