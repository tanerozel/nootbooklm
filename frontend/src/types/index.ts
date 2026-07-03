export interface Notebook {
  id: string;
  title: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface Source {
  id: string;
  notebook_id: string;
  title: string;
  source_type: string;
  url: string | null;
  status: 'pending' | 'processing' | 'ready' | 'error';
  error_message: string | null;
  chunk_count: number;
  created_at: string;
  updated_at: string;
}

export interface Citation {
  source_id: string;
  source_title: string;
  chunk_index: number;
  page_number: number | null;
  text_snippet: string;
}

export interface ChatMessage {
  id: string;
  notebook_id: string;
  role: 'user' | 'assistant';
  content: string;
  citations: Citation[] | null;
  created_at: string;
}

export interface ChatResponse {
  message_id: string;
  answer: string;
  citations: Citation[];
  chunks_used: number;
}

export interface Note {
  id: string;
  notebook_id: string;
  content: string;
  updated_at: string;
}

export interface AppSettings {
  llm_provider: string;
  openai_api_key: string;
  anthropic_api_key: string;
  llm_model: string;
  embedding_provider: string;
  embedding_model: string;
  embedding_dimension: number;
  opensearch_user: string;
  opensearch_password: string;
  opensearch_index: string;
  chunk_size: number;
  chunk_overlap: number;
}

export interface SettingsPatchResponse {
  settings: AppSettings;
  warnings: string[];
}
