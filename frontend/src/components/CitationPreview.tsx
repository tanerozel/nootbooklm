'use client';

import { X, BookOpen } from 'lucide-react';
import type { Citation } from '@/types';

interface Props {
  citation: Citation;
  onClose: () => void;
}

export default function CitationPreview({ citation, onClose }: Props) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <div className="flex items-center gap-2 min-w-0">
          <BookOpen className="w-4 h-4 text-blue-600 shrink-0" />
          <h2 className="font-semibold text-sm text-gray-700 truncate">{citation.source_title}</h2>
        </div>
        <button onClick={onClose} className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-4 flex-1 overflow-y-auto">
        <div className="flex gap-2 text-xs text-gray-500 mb-3">
          {citation.page_number && (
            <span className="bg-gray-100 px-2 py-0.5 rounded">Page {citation.page_number}</span>
          )}
          <span className="bg-gray-100 px-2 py-0.5 rounded font-mono">
            Chunk #{citation.chunk_index}
          </span>
        </div>

        <blockquote className="border-l-4 border-blue-300 pl-4 text-sm text-gray-700 leading-relaxed italic">
          {citation.text_snippet}
          {citation.text_snippet.length === 200 && '…'}
        </blockquote>

        <p className="mt-4 text-xs text-gray-400 font-mono break-all">
          source: {citation.source_id}
        </p>
      </div>
    </div>
  );
}
