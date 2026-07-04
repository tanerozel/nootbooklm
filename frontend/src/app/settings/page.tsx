'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Save, Eye, EyeOff, AlertTriangle, CheckCircle, BarChart2 } from 'lucide-react';
import { getSettings, patchSettings, getUsage } from '@/lib/api';
import type { AppSettings, UsageStats } from '@/types';

const SENSITIVE_FIELDS = ['openai_api_key', 'anthropic_api_key', 'opensearch_password'] as const;
type SensitiveField = (typeof SENSITIVE_FIELDS)[number];

const EMBEDDING_AFFECTING: (keyof AppSettings)[] = [
  'embedding_provider',
  'embedding_model',
  'embedding_dimension',
];

interface FieldConfig {
  key: keyof AppSettings;
  label: string;
  type: 'text' | 'password' | 'number' | 'select' | 'boolean';
  options?: string[];
  group: string;
}

const FIELD_CONFIG: FieldConfig[] = [
  // LLM
  { key: 'llm_provider', label: 'LLM Provider', type: 'select', options: ['openai', 'anthropic'], group: 'LLM' },
  { key: 'llm_model', label: 'LLM Model', type: 'text', group: 'LLM' },
  { key: 'openai_api_key', label: 'OpenAI API Key', type: 'password', group: 'LLM' },
  { key: 'anthropic_api_key', label: 'Anthropic API Key', type: 'password', group: 'LLM' },
  // Embedding
  { key: 'embedding_provider', label: 'Embedding Provider', type: 'select', options: ['openai', 'huggingface'], group: 'Embedding' },
  { key: 'embedding_model', label: 'Embedding Model', type: 'text', group: 'Embedding' },
  { key: 'embedding_dimension', label: 'Embedding Dimension', type: 'number', group: 'Embedding' },
  // Chunking
  { key: 'chunk_size', label: 'Chunk Size', type: 'number', group: 'Chunking' },
  { key: 'chunk_overlap', label: 'Chunk Overlap', type: 'number', group: 'Chunking' },
  // OpenSearch
  { key: 'opensearch_user', label: 'OpenSearch User', type: 'text', group: 'OpenSearch' },
  { key: 'opensearch_password', label: 'OpenSearch Password', type: 'password', group: 'OpenSearch' },
  { key: 'opensearch_index', label: 'OpenSearch Index', type: 'text', group: 'OpenSearch' },
  { key: 'opensearch_use_search_pipeline', label: 'Use Search Pipeline', type: 'boolean', group: 'OpenSearch' },
  { key: 'opensearch_search_pipeline', label: 'Search Pipeline Name', type: 'text', group: 'OpenSearch' },
  // Reranker
  { key: 'reranker_enabled', label: 'Enable Reranker', type: 'boolean', group: 'Reranker' },
  { key: 'reranker_model', label: 'Reranker Model', type: 'text', group: 'Reranker' },
  { key: 'reranker_top_k', label: 'Rerank Candidate Count', type: 'number', group: 'Reranker' },
];

export default function SettingsPage() {
  const router = useRouter();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [draft, setDraft] = useState<Partial<AppSettings>>({});
  const [editMode, setEditMode] = useState<Set<keyof AppSettings>>(new Set());
  const [showSensitive, setShowSensitive] = useState<Set<SensitiveField>>(new Set());
  const [saving, setSaving] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Security: local API key (stored in localStorage, never sent to backend config)
  const [localApiKey, setLocalApiKey] = useState('');
  const [showLocalKey, setShowLocalKey] = useState(false);
  const [localKeySaved, setLocalKeySaved] = useState(false);

  // Usage stats
  const [usage, setUsage] = useState<UsageStats | null>(null);

  useEffect(() => {
    getSettings()
      .then((s) => {
        setSettings(s);
        setDraft(s);
      })
      .catch(() => setError('Failed to load settings.'));

    // Load API key from localStorage
    const storedKey = typeof window !== 'undefined' ? localStorage.getItem('nootbooklm_api_key') ?? '' : '';
    setLocalApiKey(storedKey);

    // Load usage stats (best-effort)
    getUsage().then(setUsage).catch(() => {});
  }, []);

  const handleChange = (key: keyof AppSettings, value: string | number | boolean) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setEditMode((prev) => new Set(prev).add(key));
  };

  const toggleSensitiveVisibility = (field: SensitiveField) => {
    setShowSensitive((prev) => {
      const next = new Set(prev);
      if (next.has(field)) next.delete(field);
      else next.add(field);
      return next;
    });
  };

  const handleSaveLocalKey = () => {
    if (typeof window !== 'undefined') {
      if (localApiKey.trim()) {
        // Intentional: localStorage is the standard client-side store for API keys
        // in self-hosted single-user SPAs. The app loads no third-party scripts so
        // XSS surface is minimal. httpOnly-cookie auth would require a login endpoint
        // that is out of scope for this single-user tool.
        localStorage.setItem('nootbooklm_api_key', localApiKey.trim());
      } else {
        localStorage.removeItem('nootbooklm_api_key');
      }
    }
    setLocalKeySaved(true);
    setTimeout(() => setLocalKeySaved(false), 2000);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    setWarnings([]);
    setError(null);

    // Only send changed fields; skip sensitive fields that still show masked value (contain ****)
    const payload: Partial<AppSettings> = {};
    for (const key of Array.from(editMode) as (keyof AppSettings)[]) {
      const val = draft[key];
      if (val === undefined) continue;
      const strVal = String(val);
      if (SENSITIVE_FIELDS.includes(key as SensitiveField) && strVal.includes('****')) continue;
      (payload as Record<string, unknown>)[key] = val;
    }

    if (Object.keys(payload).length === 0) {
      setSaving(false);
      return;
    }

    try {
      const resp = await patchSettings(payload);
      setSettings(resp.settings);
      setDraft(resp.settings);
      setEditMode(new Set());
      setWarnings(resp.warnings);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError('Failed to save settings.');
    } finally {
      setSaving(false);
    }
  };

  const embeddingWillChange = EMBEDDING_AFFECTING.some((k) => editMode.has(k));

  const groups = Array.from(new Set(FIELD_CONFIG.map((f) => f.group)));

  if (!settings) {
    return (
      <main className="max-w-2xl mx-auto px-4 py-12">
        <p className="text-gray-500 text-center">{error ?? 'Loading…'}</p>
      </main>
    );
  }

  return (
    <main className="max-w-2xl mx-auto px-4 py-12">
      <div className="flex items-center gap-3 mb-8">
        <button
          onClick={() => router.push('/')}
          className="text-gray-400 hover:text-gray-600 transition"
          aria-label="Back"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-2xl font-bold">Settings</h1>
      </div>

      {saved && (
        <div className="flex items-center gap-2 mb-4 text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-3">
          <CheckCircle className="w-4 h-4 flex-shrink-0" />
          <span className="text-sm">Settings saved.</span>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 mb-4 text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {warnings.map((w, i) => (
        <div key={i} className="flex items-start gap-2 mb-4 text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span className="text-sm">{w}</span>
        </div>
      ))}

      {embeddingWillChange && !warnings.length && (
        <div className="flex items-start gap-2 mb-4 text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span className="text-sm">
            Changing embedding settings requires re-processing all existing sources.
          </span>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-8">
        {groups.map((group) => (
          <section key={group}>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
              {group}
            </h2>
            <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
              {FIELD_CONFIG.filter((f) => f.group === group).map((field) => {
                const isSensitive = SENSITIVE_FIELDS.includes(field.key as SensitiveField);
                const isVisible = !isSensitive || showSensitive.has(field.key as SensitiveField);
                const value = draft[field.key] ?? '';

                return (
                  <div key={field.key} className="flex items-center gap-3 px-4 py-3">
                    <label className="w-44 text-sm text-gray-600 flex-shrink-0">
                      {field.label}
                    </label>
                    <div className="flex-1 relative">
                      {field.type === 'select' ? (
                        <select
                          value={String(value)}
                          onChange={(e) => handleChange(field.key, e.target.value)}
                          className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          {field.options?.map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </select>
                      ) : field.type === 'number' ? (
                        <input
                          type="number"
                          value={Number(value)}
                          onChange={(e) => handleChange(field.key, Number(e.target.value))}
                          className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      ) : field.type === 'boolean' ? (
                        <label className="inline-flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={Boolean(value)}
                            onChange={(e) => handleChange(field.key, e.target.checked)}
                            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                          <span>{Boolean(value) ? 'Enabled' : 'Disabled'}</span>
                        </label>
                      ) : (
                        <input
                          type={isSensitive && !isVisible ? 'password' : 'text'}
                          value={String(value)}
                          onChange={(e) => handleChange(field.key, e.target.value)}
                          placeholder={isSensitive ? '(unchanged)' : ''}
                          className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 pr-9"
                        />
                      )}
                      {isSensitive && (
                        <button
                          type="button"
                          onClick={() => toggleSensitiveVisibility(field.key as SensitiveField)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                          aria-label={isVisible ? 'Hide' : 'Show'}
                        >
                          {isVisible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving || editMode.size === 0}
            className="flex items-center gap-2 bg-blue-600 text-white px-5 py-2.5 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>

      {/* Security section — API key stored in localStorage only */}
      <section className="mt-10">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Security</h2>
        <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
          <div className="flex items-center gap-3 px-4 py-3">
            <label className="w-44 text-sm text-gray-600 flex-shrink-0">Client API Key</label>
            <div className="flex-1 relative">
              <input
                type={showLocalKey ? 'text' : 'password'}
                value={localApiKey}
                onChange={(e) => setLocalApiKey(e.target.value)}
                placeholder="Leave blank to disable auth"
                className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 pr-9"
              />
              <button
                type="button"
                onClick={() => setShowLocalKey((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showLocalKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <button
              type="button"
              onClick={handleSaveLocalKey}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-sm text-gray-700 transition"
            >
              {localKeySaved ? <CheckCircle className="w-4 h-4 text-green-500" /> : <Save className="w-4 h-4" />}
              {localKeySaved ? 'Saved' : 'Save'}
            </button>
          </div>
        </div>
        <p className="text-xs text-gray-400 mt-2">
          Must match the <code className="bg-gray-100 px-1 rounded">API_KEY</code> environment variable set on the server.
          Stored in your browser only — never sent to the backend settings endpoint.
        </p>
      </section>

      {/* Usage / Cost section */}
      {usage && (
        <section className="mt-10 mb-8">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
            <BarChart2 className="w-4 h-4" />
            Token Usage (Today)
          </h2>
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="grid grid-cols-3 divide-x divide-gray-100">
              {[
                { label: 'Prompt tokens', value: usage.prompt_tokens.toLocaleString() },
                { label: 'Completion tokens', value: usage.completion_tokens.toLocaleString() },
                { label: 'Total tokens', value: usage.total_tokens.toLocaleString() },
              ].map(({ label, value }) => (
                <div key={label} className="px-4 py-4 text-center">
                  <p className="text-xl font-bold text-gray-900">{value}</p>
                  <p className="text-xs text-gray-500 mt-1">{label}</p>
                </div>
              ))}
            </div>
            {usage.budget && usage.budget > 0 && (
              <div className="px-4 py-3 border-t border-gray-100 bg-gray-50">
                <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                  <span>Daily budget: {usage.budget.toLocaleString()} tokens</span>
                  <span>{usage.budget_remaining?.toLocaleString() ?? '—'} remaining</span>
                </div>
                <div className="h-1.5 rounded bg-gray-200 overflow-hidden">
                  <div
                    className={`h-full rounded transition-all ${usage.budget_exceeded ? 'bg-red-500' : 'bg-blue-500'}`}
                    style={{ width: `${Math.min(100, (usage.total_tokens / usage.budget) * 100)}%` }}
                  />
                </div>
              </div>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-2">
            Set <code className="bg-gray-100 px-1 rounded">MAX_TOKENS_PER_DAY</code> on the server to enforce a daily budget.
          </p>
        </section>
      )}
    </main>
  );
}
