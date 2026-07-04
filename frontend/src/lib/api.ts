import axios from 'axios';
import type {
  AppSettings,
  ChatMessage,
  ChatResponse,
  Note,
  Notebook,
  SettingsPatchResponse,
  ShareInfo,
  SharedNotebook,
  Source,
  SourcePreview,
  Summary,
  UsageStats,
} from '@/types';

const deriveCodespacesApiUrl = () => {
  if (typeof window === 'undefined') return null;

  const { hostname, protocol } = window.location;
  if (!hostname.endsWith('.app.github.dev')) return null;

  const match = hostname.match(/^(.*)-3000(\..+)$/);
  if (!match) return null;

  return `${protocol}//${match[1]}-8000${match[2]}`;
};

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || deriveCodespacesApiUrl() || 'http://localhost:8000';

const api = axios.create({ baseURL: BASE_URL });

// Inject the API key (stored in localStorage) into every request.
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const key = localStorage.getItem('nootbooklm_api_key');
    if (key) {
      config.headers = config.headers ?? {};
      config.headers['Authorization'] = 'Bearer ' + key;
    }
  }
  return config;
});

// ── Notebooks ──────────────────────────────────────────────────────────────

export const createNotebook = (title: string, description?: string) =>
  api.post<Notebook>('/notebooks', { title, description }).then((r) => r.data);

export const listNotebooks = () =>
  api.get<Notebook[]>('/notebooks').then((r) => r.data);

export const getNotebook = (id: string) =>
  api.get<Notebook>(`/notebooks/${id}`).then((r) => r.data);

export const deleteNotebook = (id: string) =>
  api.delete(`/notebooks/${id}`);

// ── Sources ────────────────────────────────────────────────────────────────

export const uploadFile = (notebookId: string, file: File, title?: string) => {
  const form = new FormData();
  form.append('file', file);
  if (title) form.append('title', title);
  return api.post<Source>(`/notebooks/${notebookId}/sources`, form).then((r) => r.data);
};

export const addUrl = (notebookId: string, url: string, title?: string) => {
  const form = new FormData();
  form.append('url', url);
  if (title) form.append('title', title);
  return api.post<Source>(`/notebooks/${notebookId}/sources`, form).then((r) => r.data);
};

export const listSources = (notebookId: string) =>
  api.get<Source[]>(`/notebooks/${notebookId}/sources`).then((r) => r.data);

export const getSource = (notebookId: string, sourceId: string) =>
  api.get<Source>(`/notebooks/${notebookId}/sources/${sourceId}`).then((r) => r.data);

export const getSourcePreview = (notebookId: string, sourceId: string) =>
  api.get<SourcePreview>(`/notebooks/${notebookId}/sources/${sourceId}/preview`).then((r) => r.data);

export const deleteSource = (notebookId: string, sourceId: string) =>
  api.delete(`/notebooks/${notebookId}/sources/${sourceId}`);

export const retrySource = (notebookId: string, sourceId: string) =>
  api.post<Source>(`/notebooks/${notebookId}/sources/${sourceId}/retry`).then((r) => r.data);

// ── Chat ───────────────────────────────────────────────────────────────────

export const sendMessage = (notebookId: string, question: string) =>
  api.post<ChatResponse>(`/notebooks/${notebookId}/chat`, { question }).then((r) => r.data);

export const getChatHistory = (notebookId: string) =>
  api.get<ChatMessage[]>(`/notebooks/${notebookId}/chat/history`).then((r) => r.data);

export const clearHistory = (notebookId: string) =>
  api.delete(`/notebooks/${notebookId}/chat/history`);

// ── Notes ──────────────────────────────────────────────────────────────────

export const getNote = (notebookId: string) =>
  api.get<Note>(`/notebooks/${notebookId}/notes`).then((r) => r.data);

export const updateNote = (notebookId: string, content: string) =>
  api.put<Note>(`/notebooks/${notebookId}/notes`, { content }).then((r) => r.data);

// ── Settings ───────────────────────────────────────────────────────────────

export const getSettings = () =>
  api.get<AppSettings>('/settings').then((r) => r.data);

export const patchSettings = (data: Partial<AppSettings>) =>
  api.patch<SettingsPatchResponse>('/settings', data).then((r) => r.data);

export const getSummary = (notebookId: string) =>
  api.get<Summary>(`/notebooks/${notebookId}/summary`).then((r) => r.data);

export const generateSummary = (notebookId: string) =>
  api.post<Summary>(`/notebooks/${notebookId}/summary`).then((r) => r.data);

export const generateAudioBriefing = (notebookId: string) =>
  api
    .post(`/notebooks/${notebookId}/audio-briefing`, {}, { responseType: 'blob' })
    .then((r) => r.data as Blob);

export const createShareLink = (notebookId: string) =>
  api.post<ShareInfo>(`/notebooks/${notebookId}/share`).then((r) => r.data);

export const revokeShareLink = (notebookId: string) => api.delete(`/notebooks/${notebookId}/share`);

export const getSharedNotebook = (token: string) =>
  api.get<SharedNotebook>(`/shared/${token}`).then((r) => r.data);

// ── Usage ──────────────────────────────────────────────────────────────────

export const getUsage = () =>
  api.get<UsageStats>('/usage').then((r) => r.data);

export const getUsageHistory = (days = 30) =>
  api.get<UsageStats[]>(`/usage/history?days=${days}`).then((r) => r.data);
