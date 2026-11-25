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
  allow_dataset_sharing?: boolean;
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

export async function deleteUserProfile(password: string): Promise<{ status: string }> {
  const res = await fetch(`${API_BASE}/auth/profile/delete`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({ password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Error eliminando perfil" }));
    throw new Error(err.detail || "Error eliminando perfil");
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

export async function renameDataset(datasetId: string, name: string): Promise<DatasetSummary> {
  const res = await fetch(`${API_BASE}/datasets/${datasetId}`, {
    method: "PATCH",
    headers: getAuthHeaders(),
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Error renombrando dataset" }));
    throw new Error(err.detail || "Error renombrando dataset");
  }
  return res.json();
}

export async function copyDataset(datasetId: string): Promise<DatasetSummary> {
  const res = await fetch(`${API_BASE}/datasets/${datasetId}/copy`, {
    method: "POST",
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Error copiando dataset" }));
    throw new Error(err.detail || "Error copiando dataset");
  }
  return res.json();
}

export async function fetchShareableUsers(): Promise<Array<{ id: number; username: string; full_name?: string | null }>> {
  const res = await fetch(`${API_BASE}/datasets/share/users`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error("Error fetching users");
  return res.json();
}

export async function shareDatasetWithUser(
  datasetId: string,
  targetUserId: number,
  shareMode: "view" | "edit" | "copy" = "view"
): Promise<void> {
  const res = await fetch(`${API_BASE}/datasets/${datasetId}/share`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({ target_user_id: targetUserId, share_mode: shareMode }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Error compartiendo dataset" }));
    throw new Error(err.detail || "Error compartiendo dataset");
  }
}

export async function fetchDatasetShares(datasetId: string): Promise<Array<{ id: number; target_user_id: number; target_username: string; share_mode: string; status: string }>> {
  const res = await fetch(`${API_BASE}/datasets/${datasetId}/shares`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error("Error cargando comparticiones");
  return res.json();
}

export async function updateDatasetShareMode(
  datasetId: string,
  shareId: number,
  shareMode: "view" | "edit"
): Promise<{ id: number; target_user_id: number; target_username: string; share_mode: string; status: string }> {
  const res = await fetch(`${API_BASE}/datasets/${encodeURIComponent(datasetId)}/shares/${shareId}`, {
    method: "PATCH",
    headers: getAuthHeaders(),
    body: JSON.stringify({ share_mode: shareMode }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Error actualizando modo de compartición" }));
    throw new Error(err.detail || "Error actualizando modo de compartición");
  }
  return res.json();
}

export async function revokeDatasetShare(datasetId: string, shareId: number): Promise<void> {
  const res = await fetch(`${API_BASE}/datasets/${datasetId}/shares/${shareId}`, {
    method: "DELETE",
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error("Error al dejar de compartir");
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
  const res = await fetch(`${API_BASE}/datasets/${inputDatasetId}/compatible-ground-truths`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error("Error obteniendo datasets compatibles de Ground Truth");
  return res.json();
}

export async function uploadDataset(
  file: File,
  name?: string,
  expectedInputDatasetId?: string,
  isGroundTruth?: boolean
): Promise<DatasetSummary> {
  const formData = new FormData();
  formData.append("file", file);
  if (name) formData.append("name", name);
  if (expectedInputDatasetId) formData.append("expected_input_dataset_id", expectedInputDatasetId);
  if (isGroundTruth !== undefined) formData.append("is_ground_truth", String(isGroundTruth));

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

export async function exportDataset(datasetId: string, format: "csv" | "json", fallbackFilename?: string): Promise<void> {
  const res = await fetch(`${API_BASE}/datasets/${datasetId}/export?format=${format}`, {
    headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {},
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Error exportando dataset" }));
    throw new Error(err.detail || "Error exportando dataset");
  }
  const blob = await res.blob();
  const disposition = res.headers.get("Content-Disposition") || "";
  const match = disposition.match(/filename="([^"]+)"/);
  const filename = match?.[1] || `${fallbackFilename || datasetId}.${format}`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export interface SavedPromptItem {
  id: number;
  dataset_id?: string | null;
  name: string;
  system_prompt: string;
  model_prompt: string;
  created_at: string;
  updated_at: string;
  is_shared?: boolean;
  is_shared_by_owner?: boolean;
  shared_by?: string | null;
  share_mode?: string | null;
  share_id?: number | null;
}

export interface PromptShareEntry {
  id: number;
  target_user_id: number;
  target_username: string;
  share_mode: string;
  status: string;
}

export interface SharePromptResult {
  status: string;
  requires_dataset_share?: boolean;
  dataset_id?: string;
  dataset_name?: string;
  target_user_id?: number;
  target_username?: string;
  prompt_id?: number;
  share_mode?: string;
}

export async function fetchPromptShares(promptId: number): Promise<PromptShareEntry[]> {
  const res = await fetch(`${API_BASE}/prompts/saved/${promptId}/shares`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error("Error cargando comparticiones del prompt");
  return res.json();
}

export async function shareSavedPrompt(
  promptId: number,
  payload: {
    target_user_id: number;
    share_mode: "view" | "edit" | "copy";
    dataset_share_mode?: "view" | "edit" | "copy";
  }
): Promise<SharePromptResult> {
  const res = await fetch(`${API_BASE}/prompts/saved/${promptId}/share`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Error compartiendo prompt" }));
    throw new Error(err.detail || "Error compartiendo prompt");
  }
  return res.json();
}

export async function updatePromptShareMode(
  promptId: number,
  shareId: number,
  shareMode: "view" | "edit"
): Promise<PromptShareEntry> {
  const res = await fetch(`${API_BASE}/prompts/saved/${promptId}/shares/${shareId}`, {
    method: "PATCH",
    headers: getAuthHeaders(),
    body: JSON.stringify({ share_mode: shareMode }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Error actualizando modo de compartición" }));
    throw new Error(err.detail || "Error actualizando modo de compartición");
  }
  return res.json();
}

export async function revokePromptShare(promptId: number, shareId: number): Promise<void> {
  const res = await fetch(`${API_BASE}/prompts/saved/${promptId}/shares/${shareId}`, {
    method: "DELETE",
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Error al descompartir prompt" }));
    throw new Error(err.detail || "Error al descompartir prompt");
  }
}

export async function fetchSavedPrompts(datasetId?: string): Promise<SavedPromptItem[]> {
  const qs = datasetId ? `?dataset_id=${encodeURIComponent(datasetId)}` : "";
  const res = await fetch(`${API_BASE}/prompts/saved${qs}`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error("Error cargando prompts guardados");
  return res.json();
}

export async function updateSavedPrompt(
  promptId: number,
  payload: {
    name: string;
    dataset_id?: string | null;
    system_prompt: string;
    model_prompt: string;
  }
): Promise<SavedPromptItem> {
  const res = await fetch(`${API_BASE}/prompts/saved/${promptId}`, {
    method: "PUT",
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Error actualizando prompt" }));
    throw new Error(err.detail || "Error actualizando prompt");
  }
  return res.json();
}

export async function saveUserPrompt(payload: {
  name: string;
  dataset_id: string;
  system_prompt: string;
  model_prompt: string;
}): Promise<SavedPromptItem> {
  const res = await fetch(`${API_BASE}/prompts/saved`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Error guardando prompt" }));
    throw new Error(err.detail || "Error guardando prompt");
  }
  return res.json();
}

export async function deleteSavedPrompt(promptId: number): Promise<{ status: string }> {
  const res = await fetch(`${API_BASE}/prompts/saved/${promptId}`, {
    method: "DELETE",
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error("Error eliminando prompt guardado");
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

export async function discoverLocalModels(url?: string, profileId?: number): Promise<DiscoverLocalResponse> {
  const res = await fetch(`${API_BASE}/models/discover-local`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({
      url: url || (profileId ? "" : "http://localhost:11434"),
      profile_id: profileId ?? null,
    }),
  });
  if (!res.ok) throw new Error("Error al consultar servidor local");
  return res.json();
}

export async function discoverRemoteModels(
  provider: string,
  apiKey: string,
  profileId?: number
): Promise<DiscoverRemoteResponse> {
  const res = await fetch(`${API_BASE}/models/discover-remote`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({
      provider,
      api_key: apiKey,
      profile_id: profileId ?? null,
    }),
  });
  if (!res.ok) throw new Error("Error al validar clave de API con el proveedor");
  return res.json();
}

export async function detectSystemVram(url?: string, profileId?: number): Promise<DetectVramResponse> {
  const params = new URLSearchParams();
  if (url) params.set("url", url);
  if (profileId !== undefined) params.set("profile_id", String(profileId));
  const query = params.toString() ? `?${params.toString()}` : "";
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
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Error deleting experiment" }));
    throw new Error(err.detail || "Error deleting experiment");
  }
  return res.json();
}

export async function fetchExperimentShares(experimentId: string): Promise<Array<{ id: number; target_user_id: number; target_username: string; share_mode: string; status: string }>> {
  const res = await fetch(`${API_BASE}/experiments/${experimentId}/shares`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error("Error cargando comparticiones");
  return res.json();
}

export async function updateExperimentShareMode(
  experimentId: string,
  shareId: number,
  shareMode: "view" | "edit"
): Promise<{ id: number; target_user_id: number; target_username: string; share_mode: string; status: string }> {
  const res = await fetch(`${API_BASE}/experiments/${encodeURIComponent(experimentId)}/shares/${shareId}`, {
    method: "PATCH",
    headers: getAuthHeaders(),
    body: JSON.stringify({ share_mode: shareMode }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Error actualizando modo de compartición" }));
    throw new Error(err.detail || "Error actualizando modo de compartición");
  }
  return res.json();
}

export async function revokeExperimentShare(experimentId: string, shareId: number): Promise<void> {
  const res = await fetch(`${API_BASE}/experiments/${experimentId}/shares/${shareId}`, {
    method: "DELETE",
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error("Error al dejar de compartir");
}

export async function shareExperimentWithUser(
  experimentId: string,
  targetUserId: number,
  shareMode: "view" | "edit" | "copy" = "view",
  datasetShareMode?: "view" | "edit" | "copy"
): Promise<void> {
  const res = await fetch(`${API_BASE}/experiments/${experimentId}/share`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({
      target_user_id: targetUserId,
      share_mode: shareMode,
      ...(datasetShareMode ? { dataset_share_mode: datasetShareMode } : {}),
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Error compartiendo experimento" }));
    throw new Error(err.detail || "Error compartiendo experimento");
  }
}

export async function respondToExperimentShare(shareId: number, accept: boolean): Promise<void> {
  const res = await fetch(`${API_BASE}/experiments/shares/${shareId}/respond`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({ accept }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Error respondiendo invitación" }));
    throw new Error(err.detail || "Error respondiendo invitación");
  }
}

export async function fetchNotifications(): Promise<{
  notifications: Array<{
    id: string;
    type: "experiment_completed" | "dataset_shared" | "experiment_shared";
    title: string;
    resource_id: string;
    share_id?: number;
    share_mode?: string;
    from_username?: string;
    is_read?: boolean;
    created_at?: string | null;
  }>;
  unread_count: number;
}> {
  const res = await fetch(`${API_BASE}/auth/notifications`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error("Error cargando notificaciones");
  return res.json();
}

export async function markExperimentNotificationRead(experimentId: string): Promise<void> {
  await fetch(`${API_BASE}/auth/notifications/experiments/${experimentId}/read`, {
    method: "POST",
    headers: getAuthHeaders(),
  });
}

export async function markShareNotificationRead(shareType: "dataset" | "experiment", shareId: number): Promise<void> {
  await fetch(`${API_BASE}/auth/notifications/shares/${shareType}/${shareId}/read`, {
    method: "POST",
    headers: getAuthHeaders(),
  });
}

export async function markAllNotificationsRead(): Promise<void> {
  await fetch(`${API_BASE}/auth/notifications/read-all`, {
    method: "POST",
    headers: getAuthHeaders(),
  });
}

export async function dismissExperimentNotification(experimentId: string): Promise<void> {
  await fetch(`${API_BASE}/auth/notifications/experiments/${experimentId}`, {
    method: "DELETE",
    headers: getAuthHeaders(),
  });
}

export async function dismissShareNotification(shareType: "dataset" | "experiment", shareId: number): Promise<void> {
  await fetch(`${API_BASE}/auth/notifications/shares/${shareType}/${shareId}`, {
    method: "DELETE",
    headers: getAuthHeaders(),
  });
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

export interface ConnectionProfileItem {
  id: number;
  name: string;
  provider: string;
  ollama_url: string;
  api_key: string;
  vram_gb?: number | null;
  is_shared?: boolean;
  is_shared_by_owner?: boolean;
  owner_username?: string | null;
  max_vram_gb?: number | null;
  created_at: string;
  updated_at: string;
}

export interface ConnectionProfileShareItem {
  id: number;
  profile_id: number;
  target_user_id: number;
  target_username: string;
  max_vram_gb?: number | null;
  created_at: string;
}

export async function fetchConnectionProfiles(provider?: string): Promise<ConnectionProfileItem[]> {
  const query = provider ? `?provider=${encodeURIComponent(provider)}` : "";
  const res = await fetch(`${API_BASE}/models/profiles${query}`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error("Error al cargar perfiles de conexión");
  return res.json();
}

export async function saveConnectionProfile(payload: {
  name: string;
  provider: string;
  ollama_url?: string;
  api_key?: string;
  vram_gb?: number | null;
}): Promise<ConnectionProfileItem> {
  const res = await fetch(`${API_BASE}/models/profiles`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({
      name: payload.name,
      provider: payload.provider,
      ollama_url: payload.ollama_url || "",
      api_key: payload.api_key || "",
      vram_gb: payload.vram_gb ?? null,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Error al guardar el perfil de conexión" }));
    throw new Error(err.detail || "Error al guardar el perfil de conexión");
  }
  return res.json();
}

export async function updateConnectionProfile(
  profileId: number,
  payload: {
    name: string;
    provider: string;
    ollama_url?: string;
    api_key?: string;
    vram_gb?: number | null;
  }
): Promise<ConnectionProfileItem> {
  const res = await fetch(`${API_BASE}/models/profiles/${profileId}`, {
    method: "PUT",
    headers: getAuthHeaders(),
    body: JSON.stringify({
      name: payload.name,
      provider: payload.provider,
      ollama_url: payload.ollama_url || "",
      api_key: payload.api_key || "",
      vram_gb: payload.vram_gb ?? null,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Error al actualizar el perfil de conexión" }));
    throw new Error(err.detail || "Error al actualizar el perfil de conexión");
  }
  return res.json();
}

export async function deleteConnectionProfile(profileId: number): Promise<void> {
  const res = await fetch(`${API_BASE}/models/profiles/${profileId}`, {
    method: "DELETE",
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Error al eliminar el perfil de conexión" }));
    throw new Error(err.detail || "Error al eliminar el perfil de conexión");
  }
}

export async function fetchProfileShares(profileId: number): Promise<ConnectionProfileShareItem[]> {
  const res = await fetch(`${API_BASE}/models/profiles/${profileId}/shares`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error("Error al cargar comparticiones del perfil");
  return res.json();
}

export async function shareConnectionProfile(
  profileId: number,
  payload: { target_user_id: number; max_vram_gb?: number | null }
): Promise<ConnectionProfileShareItem> {
  const res = await fetch(`${API_BASE}/models/profiles/${profileId}/share`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Error al compartir el perfil" }));
    throw new Error(err.detail || "Error al compartir el perfil");
  }
  return res.json();
}

export async function revokeProfileShare(profileId: number, shareId: number): Promise<void> {
  const res = await fetch(`${API_BASE}/models/profiles/${profileId}/shares/${shareId}`, {
    method: "DELETE",
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Error al revocar acceso al perfil" }));
    throw new Error(err.detail || "Error al revocar acceso al perfil");
  }
}
