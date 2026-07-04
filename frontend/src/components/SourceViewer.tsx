'use client';

import { useEffect, useState } from 'react';
import { BookOpenText, ExternalLink, FileText, Globe, Loader2, X } from 'lucide-react';
import { getSourcePreview } from '@/lib/api';
import type { Source, SourcePreview } from '@/types';

interface Props {
  notebookId: string;
  source: Source;
  onClose: () => void;
}

export default function SourceViewer({ notebookId, source, onClose }: Props) {
  const [preview, setPreview] = useState<SourcePreview | null>(null);
  const [loading, setLoading] = useState(source.status === 'ready');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    if (source.status !== 'ready') {
      setPreview(null);
      setLoading(false);
      setError('');
      return () => {
        active = false;
      };
    }

    setLoading(true);
    setError('');
    getSourcePreview(notebookId, source.id)
      .then((data) => {
        if (active) setPreview(data);
      })
      .catch(() => {
        if (active) {
          setPreview(null);
          setError('Could not load a preview for this source.');
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [notebookId, source.id, source.status]);

  const sourceIcon = source.source_type === 'url'
    ? <Globe className="w-4 h-4 text-blue-600 shrink-0" />
    : <FileText className="w-4 h-4 text-blue-600 shrink-0" />;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <div className="flex items-center gap-2 min-w-0">
          {sourceIcon}
          <h2 className="font-semibold text-sm text-gray-700 truncate">{source.title}</h2>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600"
          title="Close source viewer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-4 flex-1 overflow-y-auto space-y-4">
        <div className="flex flex-wrap gap-2 text-xs text-gray-500">
          <span className="bg-gray-100 px-2 py-0.5 rounded uppercase">{source.source_type}</span>
          <span className="bg-gray-100 px-2 py-0.5 rounded">{source.status}</span>
          {source.chunk_count > 0 && (
            <span className="bg-gray-100 px-2 py-0.5 rounded">{source.chunk_count} chunks</span>
          )}
        </div>

        {source.url && (
          <a
            href={source.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 break-all"
          >
            <ExternalLink className="w-3.5 h-3.5 shrink-0" />
            {source.url}
          </a>
        )}

        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
          </div>
        ) : error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            {error}
          </div>
        ) : source.status !== 'ready' ? (
          <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
            This source will be viewable once ingestion finishes.
          </div>
        ) : preview && preview.segments.length > 0 ? (
          <>
            {preview.segments.map((segment, index) => (
              <section key={`${segment.page_number ?? 'segment'}-${index}`} className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-center gap-2 text-xs text-gray-500">
                  <BookOpenText className="w-3.5 h-3.5" />
                  <span className="font-medium">
                    {segment.page_number ? `Page ${segment.page_number}` : `Excerpt ${index + 1}`}
                  </span>
                </div>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700">
                  {segment.text}
                  {segment.truncated && '…'}
                </p>
              </section>
            ))}
            {preview.truncated && (
              <p className="text-xs text-gray-400">
                Preview trimmed for readability.
              </p>
            )}
          </>
        ) : (
          <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
            No previewable text was extracted from this source.
          </div>
        )}
      </div>
    </div>
  );
}
