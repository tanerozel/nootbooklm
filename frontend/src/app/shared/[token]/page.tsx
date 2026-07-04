'use client';

import { useEffect, useState } from 'react';
import { BookOpen, Loader2 } from 'lucide-react';

import { getSharedNotebook } from '@/lib/api';
import type { SharedNotebook } from '@/types';

interface Props {
  params: { token: string };
}

export default function SharedNotebookPage({ params }: Props) {
  const { token } = params;
  const [notebook, setNotebook] = useState<SharedNotebook | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    getSharedNotebook(token)
      .then(setNotebook)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (error || !notebook) {
    return (
      <div className="flex flex-col items-center justify-center h-screen text-center">
        <BookOpen className="w-12 h-12 text-gray-300 mb-4" />
        <h1 className="text-xl font-semibold text-gray-700 mb-2">Notebook not found</h1>
        <p className="text-sm text-gray-500">This share link may have been revoked or doesn&apos;t exist.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center gap-2 text-xs text-gray-400 mb-1">
            <BookOpen className="w-3.5 h-3.5" />
            <span>Shared notebook · Read-only</span>
          </div>
          <h1 className="text-xl font-bold text-gray-900">{notebook.title}</h1>
          {notebook.description && <p className="text-sm text-gray-600 mt-1">{notebook.description}</p>}
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-6 py-8">
        {notebook.summary ? (
          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
            <h2 className="font-semibold text-gray-800 mb-4">Summary</h2>
            <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{notebook.summary}</p>
            {notebook.summary_updated_at && (
              <p className="text-xs text-gray-400 mt-4">
                Last updated {new Date(notebook.summary_updated_at).toLocaleString()}
              </p>
            )}
          </div>
        ) : (
          <div className="text-center text-gray-400 py-16">
            <BookOpen className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No summary available for this notebook.</p>
          </div>
        )}
      </main>
    </div>
  );
}
