'use client';

import { useState } from 'react';
import { Check, Link2, Loader2, Trash2, X } from 'lucide-react';

import { createShareLink, revokeShareLink } from '@/lib/api';

interface Props {
  notebookId: string;
  existingToken: string | null | undefined;
  onClose: () => void;
  onTokenChange: (token: string | null) => void;
}

export default function ShareModal({ notebookId, existingToken, onClose, onTokenChange }: Props) {
  const [shareUrl, setShareUrl] = useState<string | null>(() => {
    if (!existingToken || typeof window === 'undefined') {
      return null;
    }
    return `${window.location.origin}/shared/${existingToken}`;
  });
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    try {
      const info = await createShareLink(notebookId);
      setShareUrl(
        info.share_token && typeof window !== 'undefined'
          ? `${window.location.origin}/shared/${info.share_token}`
          : info.share_url
      );
      onTokenChange(info.share_token);
      setCopied(false);
    } catch {
      setError('Failed to generate share link.');
    } finally {
      setLoading(false);
    }
  };

  const handleRevoke = async () => {
    if (!window.confirm('Revoke share link? Anyone with the current link will lose access.')) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await revokeShareLink(notebookId);
      setShareUrl(null);
      onTokenChange(null);
      setCopied(false);
    } catch {
      setError('Failed to revoke share link.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!shareUrl) {
      return;
    }
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Failed to copy share link.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-900">Share Notebook</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 text-gray-400">
            <X className="w-4 h-4" />
          </button>
        </div>
        {error && <p className="text-xs text-red-500 mb-3">{error}</p>}
        {!shareUrl ? (
          <div className="text-center py-4">
            <p className="text-sm text-gray-600 mb-4">Generate a read-only link to share this notebook.</p>
            <button
              onClick={handleGenerate}
              disabled={loading}
              className="inline-flex items-center gap-2 bg-blue-600 text-white rounded-xl px-4 py-2 text-sm hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
              Generate Share Link
            </button>
          </div>
        ) : (
          <div>
            <p className="text-xs text-gray-500 mb-2">Anyone with this link can view the notebook (read-only).</p>
            <div className="flex gap-2">
              <input
                readOnly
                value={shareUrl}
                className="flex-1 border border-gray-300 rounded-xl px-3 py-2 text-xs text-gray-700 bg-gray-50 focus:outline-none"
              />
              <button
                onClick={handleCopy}
                className="p-2 rounded-xl border border-gray-300 hover:bg-gray-50 text-gray-500"
                title="Copy link"
              >
                {copied ? <Check className="w-4 h-4 text-green-500" /> : <Link2 className="w-4 h-4" />}
              </button>
            </div>
            <button
              onClick={handleRevoke}
              disabled={loading}
              className="inline-flex items-center gap-1 mt-3 text-xs text-red-500 hover:underline disabled:opacity-50"
            >
              <Trash2 className="w-3 h-3" />
              Revoke link
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
