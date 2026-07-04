'use client';

import { useEffect, useState } from 'react';
import { Download, Loader2, RefreshCw, Volume2 } from 'lucide-react';

import { generateAudioBriefing, generateSummary, getSummary } from '@/lib/api';
import type { Summary } from '@/types';

interface Props {
  notebookId: string;
}

export default function SummaryPanel({ notebookId }: Props) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [generating, setGenerating] = useState(false);
  const [audioLoading, setAudioLoading] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getSummary(notebookId).then(setSummary).catch(() => {});
  }, [notebookId]);

  useEffect(() => {
    return () => {
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
    };
  }, [audioUrl]);

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const result = await generateSummary(notebookId);
      setSummary(result);
      setAudioUrl((currentUrl) => {
        if (currentUrl) {
          URL.revokeObjectURL(currentUrl);
        }
        return null;
      });
    } catch {
      setError('Failed to generate summary. Please try again.');
    } finally {
      setGenerating(false);
    }
  };

  const handleAudio = async () => {
    setAudioLoading(true);
    setError(null);
    try {
      const blob = await generateAudioBriefing(notebookId);
      setAudioUrl((currentUrl) => {
        if (currentUrl) {
          URL.revokeObjectURL(currentUrl);
        }
        return URL.createObjectURL(blob);
      });
    } catch {
      setError('Failed to generate audio. Check OpenAI API key and try again.');
    } finally {
      setAudioLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <h2 className="font-semibold text-sm text-gray-700 uppercase tracking-wide">Summary</h2>
        <div className="flex gap-1">
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="p-1.5 rounded hover:bg-gray-100 text-gray-500 disabled:opacity-50"
            title={summary?.summary ? 'Refresh summary' : 'Generate summary'}
          >
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          </button>
          {summary?.summary && (
            <button
              onClick={handleAudio}
              disabled={audioLoading}
              className="p-1.5 rounded hover:bg-gray-100 text-gray-500 disabled:opacity-50"
              title="Generate audio briefing"
            >
              {audioLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Volume2 className="w-4 h-4" />}
            </button>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {error && <p className="text-xs text-red-500 mb-3">{error}</p>}
        {!summary?.summary && !generating && (
          <div className="text-center text-gray-400 text-sm py-8">
            No summary yet.
            <br />
            Click <RefreshCw className="inline w-3 h-3 mx-1" /> to generate.
          </div>
        )}
        {generating && (
          <div className="flex justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
          </div>
        )}
        {summary?.summary && !generating && (
          <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{summary.summary}</p>
        )}
        {summary?.summary_updated_at && (
          <p className="text-xs text-gray-400 mt-4">
            Updated {new Date(summary.summary_updated_at).toLocaleString()}
          </p>
        )}
      </div>
      {audioUrl && (
        <div className="border-t border-gray-200 px-4 py-3">
          <p className="text-xs text-gray-500 mb-2 font-medium">Audio Briefing</p>
          <audio controls src={audioUrl} className="w-full h-8" />
          <a
            href={audioUrl}
            download="briefing.mp3"
            className="inline-flex items-center gap-1 mt-2 text-xs text-blue-600 hover:underline"
          >
            <Download className="w-3 h-3" />
            Download MP3
          </a>
        </div>
      )}
    </div>
  );
}
