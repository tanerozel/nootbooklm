'use client';

import { useRef, useState } from 'react';
import { FileText, Globe, Loader2, RefreshCw, Trash2, Upload, X } from 'lucide-react';
import { addUrl, deleteSource, retrySource, uploadFile } from '@/lib/api';
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
  const [uploadingIds, setUploadingIds] = useState<Set<string>>(new Set());
  const [uploadQueue, setUploadQueue] = useState<string[]>([]);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  const isUploading = uploadingIds.size > 0 || uploadQueue.length > 0;

  const uploadFilesSequentially = async (files: File[]) => {
    if (files.length === 0) return;

    // Mark all files as queued by name for display
    const names = files.map((f) => f.name);
    setUploadQueue(names);

    const newSources: Source[] = [];
    for (const file of files) {
      setUploadingIds((prev) => new Set(prev).add(file.name));
      setUploadQueue((prev) => prev.filter((n) => n !== file.name));
      try {
        const source = await uploadFile(notebookId, file);
        newSources.push(source);
        onSourcesChange([...sources, ...newSources]);
      } catch {
        // Show an alert but continue with the remaining files
        alert(`Upload failed for "${file.name}". Check file type (PDF, DOCX, TXT, MD).`);
      } finally {
        setUploadingIds((prev) => {
          const next = new Set(prev);
          next.delete(file.name);
          return next;
        });
      }
    }

    if (fileRef.current) fileRef.current.value = '';
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    await uploadFilesSequentially(files);
  };

  const handleUrlAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!urlInput.trim()) return;
    setUploadingIds((prev) => new Set(prev).add('__url__'));
    try {
      const source = await addUrl(notebookId, urlInput.trim());
      onSourcesChange([...sources, source]);
      setUrlInput('');
      setShowUrlInput(false);
    } catch {
      alert('Failed to add URL.');
    } finally {
      setUploadingIds((prev) => {
        const next = new Set(prev);
        next.delete('__url__');
        return next;
      });
    }
  };

  const handleDelete = async (sourceId: string) => {
    if (!confirm('Remove this source?')) return;
    await deleteSource(notebookId, sourceId);
    onSourcesChange(sources.filter((s) => s.id !== sourceId));
    if (selectedSourceId === sourceId) onSourceSelect(null);
  };

  const handleRetry = async (e: React.MouseEvent, sourceId: string) => {
    e.stopPropagation();
    try {
      const updated = await retrySource(notebookId, sourceId);
      onSourcesChange(sources.map((s) => (s.id === sourceId ? updated : s)));
    } catch {
      alert('Failed to retry source ingestion.');
    }
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragActive(false);
    const files = Array.from(e.dataTransfer.files);
    await uploadFilesSequentially(files);
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
            title="Upload files"
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
          id="source-upload-input"
          type="file"
          accept=".pdf,.docx,.txt,.md,.markdown"
          multiple
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
          <button type="submit" disabled={isUploading} className="text-blue-600 text-sm font-medium hover:text-blue-700">
            Add
          </button>
          <button type="button" onClick={() => setShowUrlInput(false)} className="text-gray-400 hover:text-gray-600">
            <X className="w-4 h-4" />
          </button>
        </form>
      )}

      {isUploading && (
        <div className="flex flex-col gap-0.5 px-4 py-2 text-sm text-blue-600 bg-blue-50">
          {Array.from(uploadingIds).filter((id) => id !== '__url__').map((name) => (
            <div key={name} className="flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
              <span className="truncate">Uploading {name}…</span>
            </div>
          ))}
          {uploadingIds.has('__url__') && (
            <div className="flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
              <span>Adding URL…</span>
            </div>
          )}
          {uploadQueue.map((name) => (
            <div key={name} className="flex items-center gap-2 text-gray-400">
              <span className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">Queued: {name}</span>
            </div>
          ))}
        </div>
      )}

      <div
        className={clsx(
          'flex-1 overflow-y-auto transition-colors',
          dragActive && 'bg-blue-50'
        )}
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragEnter={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
            setDragActive(false);
          }
        }}
        onDrop={handleDrop}
      >
        {dragActive && (
          <div className="mx-4 mt-4 rounded-xl border border-dashed border-blue-400 bg-white px-4 py-3 text-sm text-blue-700">
            Drop files here to upload them.
          </div>
        )}
        {sources.length === 0 ? (
          <div className="text-center text-gray-400 text-sm py-8 px-4">
            Upload PDFs, DOCX, TXT, MD files (multiple at once), drop them here, or add a URL to get started.
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
                    {(src.status === 'pending' || src.status === 'processing') && (
                      <span className="text-xs text-gray-400">{src.progress_percent}% · {src.ingestion_step}</span>
                    )}
                  </div>
                  {(src.status === 'pending' || src.status === 'processing') && (
                    <div className="mt-1 h-1.5 rounded bg-gray-100 overflow-hidden">
                      <div
                        className="h-full bg-blue-500 transition-all"
                        style={{ width: `${Math.max(0, Math.min(100, src.progress_percent))}%` }}
                      />
                    </div>
                  )}
                  {src.error_message && (
                    <p className="text-xs text-red-500 mt-1 truncate">{src.error_message}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 mt-0.5 shrink-0">
                  {src.status === 'error' && (
                    <button
                      onClick={(e) => handleRetry(e, src.id)}
                      className="text-gray-300 hover:text-blue-500 transition"
                      title="Retry ingestion"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(src.id); }}
                    className="text-gray-300 hover:text-red-500 transition"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
