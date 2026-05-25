import { invoke } from '@tauri-apps/api/core';

export interface OllamaModel {
  name: string;
  size: number | null;
  modified_at: string | null;
}

export interface OllamaConnectionResult {
  connected: boolean;
  models: OllamaModel[];
  error: string | null;
  is_remote: boolean;
}

export interface ChatMessage {
  role: string;
  content: string;
}

export interface OllamaChatResult {
  content: string;
  model: string;
  latency_ms: number;
}

export interface OllamaEmbedResult {
  embeddings: number[][];
  model: string;
  latency_ms: number;
  used_deprecated_endpoint: boolean;
}

export interface AIConfig {
  endpoint: string;
  default_model: string | null;
  embedding_model: string | null;
}

export const aiRuntimeService = {
  async checkConnection(endpoint: string): Promise<OllamaConnectionResult> {
    return invoke<OllamaConnectionResult>('ollama_check_connection', { endpoint });
  },

  async chat(endpoint: string, model: string, messages: ChatMessage[], promptType: string): Promise<OllamaChatResult> {
    return invoke<OllamaChatResult>('ollama_chat', { endpoint, model, messages, promptType });
  },

  async embed(endpoint: string, model: string, input: string): Promise<OllamaEmbedResult> {
    return invoke<OllamaEmbedResult>('ollama_embed', { endpoint, model, input });
  },

  async readAIConfig(vaultPath: string): Promise<AIConfig> {
    return invoke<AIConfig>('read_ai_config', { vaultPath });
  },

  async writeAIConfig(vaultPath: string, config: AIConfig): Promise<void> {
    return invoke('write_ai_config', { vaultPath, config });
  },
};
