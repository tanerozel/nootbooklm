'use client';

import { useEffect, useRef, useState } from 'react';
import { getNote, updateNote } from '@/lib/api';

interface Props {
  notebookId: string;
}

export default function NotePanel({ notebookId }: Props) {
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    getNote(notebookId).then((n) => setContent(n.content));
  }, [notebookId]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value);
    setSaved(false);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      setSaving(true);
      try {
        await updateNote(notebookId, e.target.value);
        setSaved(true);
      } finally {
        setSaving(false);
      }
    }, 1000);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <h2 className="font-semibold text-sm text-gray-700 uppercase tracking-wide">Notes</h2>
        <span className="text-xs text-gray-400">
          {saving ? 'Saving…' : saved ? 'Saved ✓' : ''}
        </span>
      </div>
      <textarea
        value={content}
        onChange={handleChange}
        placeholder="Take notes about your research here…"
        className="flex-1 resize-none p-4 text-sm text-gray-700 placeholder-gray-400 focus:outline-none bg-transparent"
      />
    </div>
  );
}
