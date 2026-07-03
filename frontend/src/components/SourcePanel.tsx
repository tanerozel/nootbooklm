'use client';

import { useRef, useState } from 'react';
import { FileText, Globe, Loader2, Trash2, Upload, X } from 'lucide-react';
import { addUrl, deleteSource, uploadFile } from '@/lib/api';
import type { Source } from '@/types';
import clsx from 'clsx';

interface Props {
  notebookId: string;
  sources: Source[];
  onSourcesChange: (sources: Source[]) => void;
  onSourceSelect: (source: Source | null) => void;
  selectedSourceId: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  processing: 'bg-blue-100 text-blue-700',
  ready: 'bg-green-100 text-green-700',
  error: 'bg-red-100 text-red-700',
};

export default function SourcePanel({
  notebookId,
  sources,
  onSourcesChange,
  onSourceSelect,
  selectedSourceId,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [urlInput, setUrlInput] = useState('');
  const [uploading, setUploading] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const source = await uploadFile(notebookId, file);
      onSourcesChange([...sources, source]);
    } catch (err) {
      alert('Upload failed. Check file type (PDF, DOCX, TXT).');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleUrlAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!urlInput.trim()) return;
    setUploading(true);
    try {
      const source = await addUrl(notebookId, urlInput.trim());
      onSourcesChange([...sources, source]);
      setUrlInput('');
      setShowUrlInput(false);
    } catch {
      alert('Failed to add URL.');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (sourceId: string) => {
    if (!confirm('Remove this source?')) return;
    await deleteSource(notebookId, sourceId);
    onSourcesChange(sources.filter((s) => s.id !== sourceId));
    if (selectedSourceId === sourceId) onSourceSelect(null);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <h2 className="font-semibold text-sm text-gray-700 uppercase tracking-wide">
          Sources ({sources.length})
        </h2>
        <div className="flex gap-1">
          <button
            onClick={() => fileRef.current?.click()}
            className="p-1.5 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-700"
            title="Upload file"
          >
            <Upload className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowUrlInput((v) => !v)}
            className="p-1.5 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-700"
            title="Add URL"
          >
            <Globe className="w-4 h-4" />
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.docx,.txt"
          className="hidden"
          onChange={handleFileUpload}
        />
      </div>

      {showUrlInput && (
        <form onSubmit={handleUrlAdd} className="px-3 py-2 border-b border-gray-100 flex gap-2">
          <input
            type="url"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="https://..."
            className="flex-1 text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <button type="submit" disabled={uploading} className="text-blue-600 text-sm font-medium hover:text-blue-700">
            Add
          </button>
          <button type="button" onClick={() => setShowUrlInput(false)} className="text-gray-400 hover:text-gray-600">
            <X className="w-4 h-4" />
          </button>
        </form>
      )}

      {uploading && (
        <div className="flex items-center gap-2 px-4 py-2 text-sm text-blue-600 bg-blue-50">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Uploading…
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {sources.length === 0 ? (
          <div className="text-center text-gray-400 text-sm py-8 px-4">
            Upload a PDF, DOCX, TXT or add a URL to get started.
          </div>
        ) : (
          <ul>
            {sources.map((src) => (
              <li
                key={src.id}
                onClick={() => onSourceSelect(src.id === selectedSourceId ? null : src)}
                className={clsx(
                  'flex items-start gap-3 px-4 py-3 cursor-pointer border-b border-gray-100 hover:bg-gray-50 transition',
                  src.id === selectedSourceId && 'bg-blue-50 hover:bg-blue-50'
                )}
              >
                <div className="mt-0.5 text-gray-400">
                  {src.source_type === 'url' ? (
                    <Globe className="w-4 h-4" />
                  ) : (
                    <FileText className="w-4 h-4" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{src.title}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span
                      className={clsx(
                        'text-xs px-1.5 py-0.5 rounded',
                        STATUS_COLORS[src.status] ?? 'bg-gray-100 text-gray-600'
                      )}
                    >
                      {src.status === 'processing' ? (
                        <span className="flex items-center gap-1">
                          <Loader2 className="w-2.5 h-2.5 animate-spin inline" />
                          processing
                        </span>
                      ) : (
                        src.status
                      )}
                    </span>
                    {src.status === 'ready' && (
                      <span className="text-xs text-gray-400">{src.chunk_count} chunks</span>
                    )}
                  </div>
                  {src.error_message && (
                    <p className="text-xs text-red-500 mt-1 truncate">{src.error_message}</p>
                  )}
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDelete(src.id); }}
                  className="mt-0.5 text-gray-300 hover:text-red-500 transition"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
