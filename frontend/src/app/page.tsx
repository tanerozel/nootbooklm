'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BookOpen, Plus, Settings, Trash2 } from 'lucide-react';
import { createNotebook, deleteNotebook, listNotebooks } from '@/lib/api';
import type { Notebook } from '@/types';

export default function HomePage() {
  const router = useRouter();
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');

  const fetchNotebooks = async () => {
    try {
      setNotebooks(await listNotebooks());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchNotebooks(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setCreating(true);
    try {
      const nb = await createNotebook(newTitle.trim());
      router.push(`/notebooks/${nb.id}`);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Delete this notebook and all its sources?')) return;
    await deleteNotebook(id);
    setNotebooks((prev) => prev.filter((n) => n.id !== id));
  };

  return (
    <main className="max-w-3xl mx-auto px-4 py-12">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <BookOpen className="w-8 h-8 text-blue-600" />
          <h1 className="text-3xl font-bold">NootbookLM</h1>
        </div>
        <button
          onClick={() => router.push('/settings')}
          className="flex items-center gap-2 text-gray-500 hover:text-gray-800 transition"
          aria-label="Settings"
        >
          <Settings className="w-5 h-5" />
          <span className="text-sm">Settings</span>
        </button>
      </div>

      <form onSubmit={handleCreate} className="flex gap-2 mb-8">
        <input
          type="text"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="New notebook title…"
          className="flex-1 border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="submit"
          disabled={creating || !newTitle.trim()}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          <Plus className="w-4 h-4" />
          {creating ? 'Creating…' : 'Create'}
        </button>
      </form>

      {loading ? (
        <p className="text-gray-500 text-center py-12">Loading…</p>
      ) : notebooks.length === 0 ? (
        <p className="text-gray-400 text-center py-12">
          No notebooks yet. Create one to get started.
        </p>
      ) : (
        <ul className="space-y-3">
          {notebooks.map((nb) => (
            <li
              key={nb.id}
              onClick={() => router.push(`/notebooks/${nb.id}`)}
              className="flex items-center justify-between bg-white border border-gray-200 rounded-xl px-5 py-4 cursor-pointer hover:border-blue-300 hover:shadow-sm transition"
            >
              <div>
                <p className="font-medium">{nb.title}</p>
                <p className="text-sm text-gray-400">
                  {new Date(nb.updated_at).toLocaleDateString()}
                </p>
              </div>
              <button
                onClick={(e) => handleDelete(nb.id, e)}
                className="text-gray-400 hover:text-red-500 transition p-1"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
