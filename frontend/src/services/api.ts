import {
  DatasetSummary,
  PaginatedRowsResponse,
  ModelCatalogItem,
  PromptValidationResponse,
  User,
  UserConfig,
  SavedBenchmarkSummary,
  SavedBenchmarkDetail,
  ExperimentSummary,
  ExperimentDetail,
  ExperimentCreateRequest,
  DiscoverLocalResponse,
  DiscoverRemoteResponse,
  DetectVramResponse,
  ContextCalculationRequest,
  ContextCalculationResponse,
  GeneratedPromptResponse,
  ModelAuditResponse,
  PairwiseAuditResponse,
} from "../types";

const API_BASE = import.meta.env.VITE_API_BASE || "/api";

export function getToken(): string | null {
  return localStorage.getItem("token");
}

export function setToken(token: string): void {
  localStorage.setItem("token", token);
}

export function removeToken(): void {
  localStorage.removeItem("token");
}

function getAuthHeaders(): HeadersInit {
  const token = getToken();
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export async function loginUser(
  username: string,
  password: string
): Promise<{ access_token: string; user: User; config: UserConfig }> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Error de autenticación" }));
    throw new Error(err.detail || "Error de autenticación");
  }
  const data = await res.json();
  setToken(data.access_token);
  return data;
}

export async function registerUser(
  username: string,
  password: string,
  fullName?: string,
  language: string = "es"
): Promise<{ access_token: string; user: User; config: UserConfig }> {
  const res = await fetch(`${API_BASE}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username,
      password,
      full_name: fullName || undefined,
      language,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Error al crear usuario" }));
    throw new Error(err.detail || "Error al crear usuario");
  }
  const data = await res.json();
  setToken(data.access_token);
  return data;
}

export async function fetchMe(): Promise<{ user: User; config: UserConfig }> {
  const res = await fetch(`${API_BASE}/auth/me`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error("No autenticado");
  return res.json();
}

export async function updateUserConfig(config: Partial<UserConfig>): Promise<UserConfig> {
  const res = await fetch(`${API_BASE}/auth/config`, {
    method: "PUT",
    headers: getAuthHeaders(),
    body: JSON.stringify(config),
  });
  if (!res.ok) throw new Error("Error actualizando configuración");
  return res.json();
}

export async function updateUserProfile(payload: {
  email?: string;
  full_name?: string;
  language?: string;
  current_password?: string;
  new_password?: string;
}): Promise<{ user: User; config: UserConfig }> {
  const res = await fetch(`${API_BASE}/auth/profile`, {
    method: "PUT",
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Error actualizando perfil" }));
    throw new Error(err.detail || "Error actualizando perfil");
  }
  return res.json();
}

export async function saveBenchmarkRun(payload: {
  benchmark_id?: string;
  name: string;
  description?: string;
  dataset_id: string;
  dataset_name?: string;
  task_type: string;
  template: string;
  system_prompt?: string;
  model_ids: string[];
  sample_size: number;
  model_summaries: Record<string, any>;
  pairwise_matrix: any[];
  best_performers: Record<string, string>;
}): Promise<SavedBenchmarkSummary> {
  const res = await fetch(`${API_BASE}/benchmarks/save`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Error guardando benchmark en PostgreSQL");
  return res.json();
}

export async function fetchSavedBenchmarks(): Promise<SavedBenchmarkSummary[]> {
  const res = await fetch(`${API_BASE}/benchmarks/saved`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error("Error obteniendo benchmarks guardados");
  return res.json();
}

export async function fetchSavedBenchmarkDetail(id: string): Promise<SavedBenchmarkDetail> {
  const res = await fetch(`${API_BASE}/benchmarks/saved/${id}`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error("Error cargando detalle del benchmark");
  return res.json();
}

export async function deleteSavedBenchmark(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/benchmarks/saved/${id}`, {
    method: "DELETE",
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error("Error eliminando benchmark");
}

export async function fetchDatasets(): Promise<DatasetSummary[]> {
  const res = await fetch(`${API_BASE}/datasets`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error("Error fetching datasets");
  return res.json();
}

export async function fetchShareableUsers(): Promise<Array<{ id: number; username: string; full_name?: string | null }>> {
  const res = await fetch(`${API_BASE}/datasets/share/users`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error("Error fetching users");
  return res.json();
}

export async function shareDatasetWithUser(datasetId: string, targetUserId: number): Promise<void> {
  const res = await fetch(`${API_BASE}/datasets/${datasetId}/share`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({ target_user_id: targetUserId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Error compartiendo dataset" }));
    throw new Error(err.detail || "Error compartiendo dataset");
  }
}

export async function respondToDatasetShare(shareId: number, accept: boolean): Promise<void> {
  const res = await fetch(`${API_BASE}/datasets/shares/${shareId}/respond`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({ accept }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Error respondiendo invitación" }));
    throw new Error(err.detail || "Error respondiendo invitación");
  }
}

export async function deleteDataset(id: string): Promise<void> {
  const token = getToken();
  const res = await fetch(`${API_BASE}/datasets/${id}`, {
    method: "DELETE",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Error eliminando dataset" }));
    throw new Error(err.detail || "Error eliminando dataset");
  }
}

export async function fetchDatasetDetails(id: string): Promise<DatasetSummary> {
  const res = await fetch(`${API_BASE}/datasets/${id}`);
  if (!res.ok) throw new Error("Error fetching dataset details");
  return res.json();
}

export async function fetchPaginatedRows(
  id: string,
  offset: number = 0,
  limit: number = 50,
  columns?: string[],
  search?: string
): Promise<PaginatedRowsResponse> {
  const params = new URLSearchParams({
    offset: offset.toString(),
    limit: limit.toString(),
  });
  if (columns && columns.length > 0) {
    params.append("columns", columns.join(","));
  }
  if (search) {
    params.append("search", search);
  }
  const res = await fetch(`${API_BASE}/datasets/${id}/rows?${params.toString()}`);
  if (!res.ok) throw new Error("Error fetching rows");
  return res.json();
}

export interface CompatibleGroundTruth {
  dataset_id: string;
  dataset_name: string;
  filename: string;
  common_ids_count: number;
  total_ground_truth_ids: number;
  overlap_percentage: number;
  dimensions_count: number;
  schema?: any;
}

export async function fetchCompatibleGroundTruths(inputDatasetId: string): Promise<CompatibleGroundTruth[]> {
  const res = await fetch(`${API_BASE}/datasets/${inputDatasetId}/compatible-ground-truths`);
  if (!res.ok) throw new Error("Error obteniendo datasets compatibles de Ground Truth");
  return res.json();
}

export async function uploadDataset(file: File, name?: string, expectedInputDatasetId?: string): Promise<DatasetSummary> {
  const formData = new FormData();
  formData.append("file", file);
  if (name) formData.append("name", name);
  if (expectedInputDatasetId) formData.append("expected_input_dataset_id", expectedInputDatasetId);

  const res = await fetch(`${API_BASE}/datasets/upload`, {
    method: "POST",
    headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {},
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Error subiendo archivo" }));
    throw new Error(err.detail || "Error subiendo archivo");
  }
  return res.json();
}

export async function generatePromptTemplate(
  dataset_id: string,
  task_type: string,
  input_text_columns: string[],
  context_columns: string[],
  ground_truth_column?: string
): Promise<GeneratedPromptResponse> {
  const res = await fetch(`${API_BASE}/prompts/generate`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({
      dataset_id,
      task_type,
      input_text_columns,
      context_columns,
      ground_truth_column,
    }),
  });
  if (!res.ok) throw new Error("Error generating prompt");
  return res.json();
}

export async function validatePrompt(
  dataset_id: string,
  template: string,
  system_prompt?: string,
  allowed_columns?: string[]
): Promise<PromptValidationResponse> {
  const res = await fetch(`${API_BASE}/prompts/validate`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({
      dataset_id,
      template,
      system_prompt,
      allowed_columns,
    }),
  });
  if (!res.ok) throw new Error("Error validating prompt");
  return res.json();
}

export async function fetchModels(): Promise<ModelCatalogItem[]> {
  const res = await fetch(`${API_BASE}/models`);
  if (!res.ok) throw new Error("Error fetching models");
  return res.json();
}

export async function checkOllama(url?: string): Promise<{ is_online: boolean; models: string[] }> {
  const res = await fetch(`${API_BASE}/models/check-ollama`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({ url }),
  });
  if (!res.ok) throw new Error("Error checking Ollama");
  return res.json();
}

export async function discoverLocalModels(url?: string): Promise<DiscoverLocalResponse> {
  const res = await fetch(`${API_BASE}/models/discover-local`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({ url: url || "http://localhost:11434" }),
  });
  if (!res.ok) throw new Error("Error al consultar servidor local");
  return res.json();
}

export async function discoverRemoteModels(provider: string, apiKey: string): Promise<DiscoverRemoteResponse> {
  const res = await fetch(`${API_BASE}/models/discover-remote`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({ provider, api_key: apiKey }),
  });
  if (!res.ok) throw new Error("Error al validar clave de API con el proveedor");
  return res.json();
}

export async function detectSystemVram(url?: string): Promise<DetectVramResponse> {
  const query = url ? `?url=${encodeURIComponent(url)}` : "";
  const res = await fetch(`${API_BASE}/models/detect-vram${query}`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error("Error al detectar VRAM del sistema");
  return res.json();
}

export async function calculateContextSize(payload: ContextCalculationRequest): Promise<ContextCalculationResponse> {
  const res = await fetch(`${API_BASE}/models/calculate-context`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Error al calcular el tamaño de contexto");
  return res.json();
}

export async function runBenchmarkStream(
  payload: {
    dataset_id: string;
    model_ids: string[];
    template: string;
    system_prompt?: string;
    sample_size: number;
    batch_size?: number;
    api_keys?: Record<string, string>;
    task_type?: string;
  },
  onEvent: (eventType: string, data: any) => void,
  onError: (err: any) => void
) {
  try {
    const response = await fetch(`${API_BASE}/benchmark/run`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify(payload),
    });

    if (!response.ok || !response.body) {
      throw new Error(`HTTP error ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split("\n\n");
      buffer = blocks.pop() || "";

      for (const block of blocks) {
        if (!block.trim()) continue;
        const lines = block.split("\n");
        let eventType = "message";
        let dataStr = "";

        for (const line of lines) {
          if (line.startsWith("event: ")) {
            eventType = line.replace("event: ", "").trim();
          } else if (line.startsWith("data: ")) {
            dataStr = line.replace("data: ", "").trim();
          }
        }

        if (dataStr) {
          try {
            const parsed = JSON.parse(dataStr);
            onEvent(eventType, parsed);
          } catch (e) {
            console.error("Error parsing SSE JSON payload:", e, dataStr);
          }
        }
      }
    }
  } catch (err) {
    onError(err);
  }
}

// Experiments API
export async function fetchExperiments(status?: string): Promise<ExperimentSummary[]> {
  const url = status ? `${API_BASE}/experiments?status=${encodeURIComponent(status)}` : `${API_BASE}/experiments`;
  const res = await fetch(url, { headers: getAuthHeaders() });
  if (!res.ok) throw new Error("Error fetching experiments");
  return res.json();
}

export async function createExperiment(data: ExperimentCreateRequest, autoStart: boolean = true): Promise<ExperimentDetail> {
  const res = await fetch(`${API_BASE}/experiments?auto_start=${autoStart}`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Error creating experiment");
  return res.json();
}

export async function updateExperimentTemplate(id: string, data: ExperimentCreateRequest): Promise<ExperimentDetail> {
  const res = await fetch(`${API_BASE}/experiments/${id}`, {
    method: "PUT",
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Error updating template");
  return res.json();
}

export async function fetchExperimentDetail(id: string): Promise<ExperimentDetail> {
  const res = await fetch(`${API_BASE}/experiments/${id}`, { headers: getAuthHeaders() });
  if (!res.ok) throw new Error("Error fetching experiment detail");
  return res.json();
}

export async function startExperiment(id: string): Promise<ExperimentDetail> {
  const res = await fetch(`${API_BASE}/experiments/${id}/start`, {
    method: "POST",
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error("Error starting experiment");
  return res.json();
}

export async function pauseExperiment(id: string): Promise<ExperimentDetail> {
  const res = await fetch(`${API_BASE}/experiments/${id}/pause`, {
    method: "POST",
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error("Error pausing experiment");
  return res.json();
}

export async function resumeExperiment(id: string): Promise<ExperimentDetail> {
  const res = await fetch(`${API_BASE}/experiments/${id}/resume`, {
    method: "POST",
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error("Error resuming experiment");
  return res.json();
}

export async function cancelExperiment(id: string): Promise<ExperimentDetail> {
  const res = await fetch(`${API_BASE}/experiments/${id}/cancel`, {
    method: "POST",
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error("Error cancelling experiment");
  return res.json();
}

export async function deleteExperiment(id: string): Promise<{ message: string; id: string }> {
  const res = await fetch(`${API_BASE}/experiments/${id}`, {
    method: "DELETE",
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error("Error deleting experiment");
  return res.json();
}

export async function recalculateExperimentMetrics(id: string, evalSpec?: Record<string, any>): Promise<ExperimentDetail> {
  const headers: Record<string, string> = {
    ...(getAuthHeaders() as Record<string, string>),
    "Content-Type": "application/json",
  };
  const body = evalSpec ? JSON.stringify({ eval_spec: evalSpec }) : undefined;
  const res = await fetch(`${API_BASE}/experiments/${id}/recalculate`, {
    method: "POST",
    headers,
    body,
  });
  if (!res.ok) throw new Error("Error recalculating experiment metrics");
  return res.json();
}

export async function fetchModelAudit(experimentId: string, modelId: string): Promise<ModelAuditResponse> {
  const res = await fetch(`${API_BASE}/experiments/${experimentId}/audit/model/${encodeURIComponent(modelId)}`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error("Error obteniendo auditoría del modelo");
  return res.json();
}

export async function fetchPairwiseAudit(experimentId: string, modelA: string, modelB: string): Promise<PairwiseAuditResponse> {
  const params = new URLSearchParams({ model_a: modelA, model_b: modelB });
  const res = await fetch(`${API_BASE}/experiments/${experimentId}/audit/pairwise?${params.toString()}`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error("Error obteniendo auditoría de discrepancias");
  return res.json();
}

export function subscribeToExperimentStream(
  id: string,
  onEvent: (eventType: string, data: any) => void,
  onError?: (err: any) => void
): () => void {
  const eventSource = new EventSource(`${API_BASE}/experiments/${id}/stream`);

  eventSource.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data);
      onEvent("message", data);
    } catch (err) {
      console.error(err);
    }
  };

  const eventTypes = [
    "snapshot",
    "status_change",
    "experiment_start",
    "model_start",
    "sample_update",
    "model_finished",
    "experiment_completed",
    "cancelled",
  ];

  eventTypes.forEach((type) => {
    eventSource.addEventListener(type, (e: any) => {
      try {
        const data = JSON.parse(e.data);
        onEvent(type, data);
      } catch (err) {
        console.error(err);
      }
    });
  });

  eventSource.onerror = (err) => {
    if (onError) onError(err);
    eventSource.close();
  };

  return () => {
    eventSource.close();
  };
}
