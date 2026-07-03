import axios from 'axios';
import type { Notebook, Source, ChatMessage, ChatResponse, Note } from '@/types';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

const api = axios.create({ baseURL: BASE_URL });

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

export const deleteSource = (notebookId: string, sourceId: string) =>
  api.delete(`/notebooks/${notebookId}/sources/${sourceId}`);

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
