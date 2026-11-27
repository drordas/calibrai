import React, { useCallback, useEffect, useMemo, useState } from "react";
import { DatasetSummary, ShareUser } from "../types";
import {
  deleteSavedPrompt,
  fetchDatasets,
  fetchPromptShares,
  fetchSavedPrompts,
  PromptShareEntry,
  revokePromptShare,
  SavedPromptItem,
  shareSavedPrompt,
  updatePromptShareMode,
  updateSavedPrompt,
} from "../services/api";
import { SharedAccessModal } from "./SharedAccessModal";
import { ShareableUserItem, ShareUserPicker } from "./ShareUserPicker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertCircle,
  ArrowLeft,
  ChevronDown,
  Database,
  Download,
  Eye,
  FileCode,
  Loader2,
  Pencil,
  Share2,
  Trash2,
  Users,
} from "lucide-react";

function convertPlainPromptToMarkdown(raw: string): string {
  const text = (raw || "").replace(/\r\n/g, "\n").trim();
  if (!text) return "";

  const lines = text.split("\n");
  const out: string[] = [];
  let inCodeFence = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.startsWith("```")) {
      inCodeFence = !inCodeFence;
      out.push(line);
      continue;
    }

    if (inCodeFence) {
      out.push(line);
      continue;
    }

    // Banner separator lines: ===== TITLE =====
    if (/^[=\-_]{6,}$/.test(trimmed)) {
      const next = lines[i + 1]?.trim() ?? "";
      const afterNext = lines[i + 2]?.trim() ?? "";
      if (next && /^[=\-_]{6,}$/.test(afterNext)) {
        out.push(`## ${next}`);
        i += 2;
        continue;
      }
      // Single separator line without wrapped title -> horizontal rule
      out.push("---");
      continue;
    }

    // Sub-section markers like "── Example 1 (...) ──"
    const subMatch = trimmed.match(/^[─\-]{2,}\s*(.+?)\s*[─\-]{2,}$/);
    if (subMatch) {
      out.push(`### ${subMatch[1]}`);
      continue;
    }

    // Already markdown heading or list
    if (/^#{1,6}\s/.test(trimmed) || /^[-*+]\s/.test(trimmed)) {
      out.push(line);
      continue;
    }

    // Unicode bullet "• ..." -> Markdown "- ..."
    if (/^[•·▪]\s+/.test(trimmed)) {
      out.push(`- ${trimmed.replace(/^[•·▪]\s+/, "")}`);
      continue;
    }

    // Standalone ALL-CAPS section headers like "RULES:" or "DIMENSIONS:"
    if (/^[A-Z0-9_][A-Z0-9_\s/&-]{2,}:$/.test(trimmed)) {
      out.push(`### ${trimmed.slice(0, -1)}`);
      continue;
    }

    // Key: Value lines (e.g., "COMPANY NAME: {enterprise_name}", "SENTIMENT: ...")
    const kvMatch = trimmed.match(/^([A-Z][A-Z0-9_ ]{1,30}):\s*(.+)$/);
    if (kvMatch) {
      out.push(`- **${kvMatch[1].trim()}:** ${kvMatch[2]}`);
      continue;
    }

    out.push(line);
  }

  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function normalizeSectionKey(title: string): string {
  return (
    title
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "section"
  );
}

function splitParagraphOrLines(block: string): string | string[] | Record<string, any> {
  const lines = block
    .split("\n")
    .map((l) => l.trimEnd())
    .filter((l) => l.trim().length > 0);
  if (lines.length === 0) return "";
  if (lines.length === 1) return lines[0].trim();

  const kvLines = lines.filter((l) => /^[A-Z0-9_ ]{2,40}:\s*.+$/.test(l.trim()));
  if (kvLines.length === lines.length) {
    const obj: Record<string, string> = {};
    for (const l of lines) {
      const idx = l.indexOf(":");
      const k = l.slice(0, idx).trim();
      const v = l.slice(idx + 1).trim();
      obj[k] = v;
    }
    return obj;
  }

  return lines.map((l) => l.trim());
}

function parseSectionContentToJson(content: string): any {
  const trimmed = content.trim();
  if (!trimmed) return "";

  const numberedRe = /(?:^|\n)(\d+\.\s+[^\n]+)\n([\s\S]*?)(?=(?:\n\d+\.\s+[^\n]+\n)|\Z)/g;
  const numberedMatches = Array.from(trimmed.matchAll(numberedRe));
  if (numberedMatches.length >= 2) {
    const firstStart = numberedMatches[0].index ?? 0;
    const result: Record<string, any> = {};
    const intro = trimmed.slice(0, firstStart).trim();
    if (intro) result.intro = splitParagraphOrLines(intro);
    for (const m of numberedMatches) {
      const subTitle = m[1].trim();
      const subBody = m[2].trim();
      result[subTitle] = splitParagraphOrLines(subBody);
    }
    const lastMatch = numberedMatches[numberedMatches.length - 1];
    const lastEnd = (lastMatch.index ?? 0) + lastMatch[0].length;
    const tail = trimmed.slice(lastEnd).trim();
    if (tail) result.inputs = splitParagraphOrLines(tail);
    return result;
  }

  const blocks = trimmed
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);

  if (blocks.length > 1) {
    return blocks.map((b) => splitParagraphOrLines(b));
  }

  return splitParagraphOrLines(trimmed);
}

function parsePromptBodyToStructuredJson(cleanBody: string): Record<string, any> {
  const text = cleanBody.replace(/\r\n/g, "\n").trim();
  const variables = Array.from(
    new Set(Array.from(text.matchAll(/\{([a-zA-Z0-9_.-]+)\}/g)).map((m) => m[1]))
  );

  const bannerRe = /(?:^|\n)[=\-_]{6,}\n([^\n]+)\n[=\-_]{6,}\n([\s\S]*?)(?=(?:\n[=\-_]{6,}\n[^\n]+\n[=\-_]{6,}\n)|\Z)/g;
  const bannerMatches = Array.from(text.matchAll(bannerRe));

  const sections: Record<string, any> = {};
  if (bannerMatches.length > 0) {
    const firstIdx = bannerMatches[0].index ?? 0;
    const preamble = text.slice(0, firstIdx).trim();
    if (preamble) {
      sections.preamble = splitParagraphOrLines(preamble);
    }
    for (const m of bannerMatches) {
      const key = normalizeSectionKey(m[1]);
      sections[key] = parseSectionContentToJson(m[2]);
    }
  } else {
    const mdRe = /(?:^|\n)#{1,3}\s+([^\n]+)\n([\s\S]*?)(?=(?:\n#{1,3}\s+[^\n]+\n)|\Z)/g;
    const mdMatches = Array.from(text.matchAll(mdRe));
    if (mdMatches.length > 0) {
      for (const m of mdMatches) {
        const key = normalizeSectionKey(m[1]);
        sections[key] = parseSectionContentToJson(m[2]);
      }
    } else {
      sections.content = splitParagraphOrLines(text);
    }
  }

  return {
    variables,
    sections,
  };
}

function extractPromptArtifacts(rawBody: string): {
  cleanBody: string;
  jsonBlockRaw: string | null;
  specBlockRaw: string | null;
  outputSchema: Record<string, any> | null;
  evaluationSpec: Record<string, any> | null;
} {
  let cleanBody = (rawBody || "").replace(/\r\n/g, "\n").trim();
  let jsonBlockRaw: string | null = null;
  let specBlockRaw: string | null = null;
  let outputSchema: Record<string, any> | null = null;
  let evaluationSpec: Record<string, any> | null = null;

  const specMatch = cleanBody.match(/```(?:evaluation-spec|eval-spec)\s*([\s\S]*?)\s*```/i);
  if (specMatch) {
    specBlockRaw = specMatch[0];
    const specText = specMatch[1].trim();
    const taskMatch = specText.match(/task_type:\s*([^\n]+)/i);
    evaluationSpec = {
      task_type: taskMatch ? taskMatch[1].trim() : "generic",
      raw_yaml: specText,
    };
    cleanBody = (
      cleanBody.slice(0, specMatch.index) +
      "\n" +
      cleanBody.slice((specMatch.index ?? 0) + specMatch[0].length)
    ).trim();
  }

  const jsonMatch = cleanBody.match(/```json\s*([\s\S]*?)\s*```/i);
  if (jsonMatch) {
    jsonBlockRaw = jsonMatch[0];
    try {
      outputSchema = JSON.parse(jsonMatch[1].trim());
    } catch {
      outputSchema = null;
    }
    cleanBody = (
      cleanBody.slice(0, jsonMatch.index) +
      "\n" +
      cleanBody.slice((jsonMatch.index ?? 0) + jsonMatch[0].length)
    ).trim();
  }

  if (!outputSchema) {
    const blockRe = /(?:^|\n)([A-Z][A-Z0-9_]{2,})\n((?:[A-Z][A-Z0-9_]{1,}:[^\n]*(?:\n|$))+)/g;
    const inferred: Record<string, any> = {};
    for (const m of cleanBody.matchAll(blockRe)) {
      const dimKey = m[1].toLowerCase();
      const fieldsObj: Record<string, any> = {};
      const fieldLines = m[2].trim().split("\n");
      for (const fl of fieldLines) {
        const idx = fl.indexOf(":");
        if (idx === -1) continue;
        const fk = fl.slice(0, idx).trim().toLowerCase();
        const fv = fl.slice(idx + 1).trim().toLowerCase();
        fieldsObj[fk] = fv.includes("||") || fk.includes("marker") || fk.includes("cita") ? ["string"] : "string";
      }
      if (Object.keys(fieldsObj).length > 0) {
        inferred[dimKey] = fieldsObj;
      }
    }
    if (Object.keys(inferred).length > 0) {
      outputSchema = inferred;
    }
  }

  if (!evaluationSpec && outputSchema) {
    evaluationSpec = {
      task_type: "aspect_polarity",
      output_schema: outputSchema,
    };
  }

  return { cleanBody, jsonBlockRaw, specBlockRaw, outputSchema, evaluationSpec };
}

function buildPromptDownloadContent(
  item: SavedPromptItem,
  format: "txt" | "md" | "json",
  includeOutputAndSpec: boolean = false
): string {
  const sys = (item.system_prompt || "").trim();
  const rawBody = (item.model_prompt || "").trim();
  const artifacts = extractPromptArtifacts(rawBody);
  const body = artifacts.cleanBody;

  if (format === "json") {
    const payload: Record<string, any> = {
      name: item.name || "Prompt",
      dataset_id: item.dataset_id ?? null,
      system_prompt: sys,
      prompt: parsePromptBodyToStructuredJson(body),
    };
    if (includeOutputAndSpec) {
      if (artifacts.outputSchema) payload.output_schema = artifacts.outputSchema;
      if (artifacts.evaluationSpec) payload.evaluation_spec = artifacts.evaluationSpec;
    }
    if (item.created_at) payload.created_at = item.created_at;
    if (item.updated_at) payload.updated_at = item.updated_at;
    return `${JSON.stringify(payload, null, 2)}\n`;
  }

  let effectiveBody = body;
  if (includeOutputAndSpec) {
    const extras: string[] = [];
    if (artifacts.jsonBlockRaw) {
      extras.push(artifacts.jsonBlockRaw);
    } else if (artifacts.outputSchema) {
      extras.push(`\`\`\`json\n${JSON.stringify(artifacts.outputSchema, null, 2)}\n\`\`\``);
    }
    if (artifacts.specBlockRaw) {
      extras.push(artifacts.specBlockRaw);
    } else if (artifacts.evaluationSpec) {
      const schemaYaml = artifacts.outputSchema
        ? Object.entries(artifacts.outputSchema)
            .map(([k, v]) => `  ${k}: ${JSON.stringify(v)}`)
            .join("\n")
        : "";
      extras.push(
        `\`\`\`evaluation-spec\ntask_type: ${artifacts.evaluationSpec.task_type || "generic"}${schemaYaml ? `\noutput_schema:\n${schemaYaml}` : ""}\n\`\`\``
      );
    }
    if (extras.length > 0) {
      effectiveBody = `${body}\n\n${extras.join("\n\n")}`;
    }
  }

  if (format === "txt") {
    if (!sys) return effectiveBody;
    return `=== SYSTEM PROMPT ===\n${sys}\n\n=== PLANTILLA DE PROMPT ===\n${effectiveBody}\n`;
  }

  const mdBody = convertPromptTextIfNeeded(effectiveBody);
  const parts: string[] = [`# ${item.name.trim() || "Prompt"}`];
  if (sys) {
    parts.push(`## System Prompt\n\n${convertPromptTextIfNeeded(sys)}`);
  }
  parts.push(`## Plantilla de Prompt\n\n${mdBody}`);
  return `${parts.join("\n\n")}\n`;
}

function convertPromptTextIfNeeded(text: string): string {
  const hasMdHeading = /^#{1,6}\s+/m.test(text);
  const hasMdList = /^[-*+]\s+/m.test(text);
  const hasBanner = /^[=\-_]{6,}$/m.test(text) || /^[•·▪]\s+/m.test(text);
  // Always normalize banners/bullets if present; if already clean Markdown, preserve as-is
  if (hasMdHeading && hasMdList && !hasBanner) {
    return text.trim();
  }
  return convertPlainPromptToMarkdown(text);
}

interface DashboardPromptsModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialDatasetFilter?: string;
}

export const DashboardPromptsModal: React.FC<DashboardPromptsModalProps> = ({
  isOpen,
  onClose,
  initialDatasetFilter,
}) => {
  const [prompts, setPrompts] = useState<SavedPromptItem[]>([]);
  const [datasets, setDatasets] = useState<DatasetSummary[]>([]);
  const [selectedDatasetFilter, setSelectedDatasetFilter] = useState<string>("all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const [previewTarget, setPreviewTarget] = useState<SavedPromptItem | null>(null);
  const [editTarget, setEditTarget] = useState<SavedPromptItem | null>(null);
  const [editName, setEditName] = useState("");
  const [editDatasetId, setEditDatasetId] = useState<string>("");
  const [editSystemPrompt, setEditSystemPrompt] = useState("");
  const [editModelPrompt, setEditModelPrompt] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<SavedPromptItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [downloadTarget, setDownloadTarget] = useState<SavedPromptItem | null>(null);
  const [downloadFileName, setDownloadFileName] = useState("");
  const [includeOutputAndSpec, setIncludeOutputAndSpec] = useState(false);

  // Share prompt state
  const [shareTarget, setShareTarget] = useState<SavedPromptItem | null>(null);
  const [selectedShareUser, setSelectedShareUser] = useState<ShareableUserItem | null>(null);
  const [shareMode, setShareMode] = useState<"view" | "edit" | "copy">("view");
  const [activePromptShares, setActivePromptShares] = useState<PromptShareEntry[]>([]);
  const [sharingUserId, setSharingUserId] = useState<number | null>(null);
  const [accessModalPrompt, setAccessModalPrompt] = useState<SavedPromptItem | null>(null);

  // Dataset dependency modal when sharing prompt whose dataset isn't shared yet
  const [datasetShareRequired, setDatasetShareRequired] = useState<{
    prompt: SavedPromptItem;
    datasetId: string;
    datasetName: string;
    targetUserId: number;
    targetUsername: string;
    promptShareMode: "view" | "edit" | "copy";
  } | null>(null);
  const [datasetShareMode, setDatasetShareMode] = useState<"view" | "edit" | "copy">("view");
  const [confirmingDatasetAndPrompt, setConfirmingDatasetAndPrompt] = useState(false);

  const handleOpenSharePrompt = async (item: SavedPromptItem) => {
    setShareTarget(item);
    setShareMode("view");
    setError(null);
    try {
      const shares = await fetchPromptShares(item.id);
      setActivePromptShares(shares);
    } catch (err: any) {
      setError(err?.message || "Error cargando usuarios para compartir");
    }
  };

  const handleSharePromptWithUser = async (u: ShareUser) => {
    if (!shareTarget) return;
    setSharingUserId(u.id);
    setError(null);
    try {
      const res = await shareSavedPrompt(shareTarget.id, {
        target_user_id: u.id,
        share_mode: shareMode,
      });
      if (res.requires_dataset_share) {
        setDatasetShareMode("view");
        setDatasetShareRequired({
          prompt: shareTarget,
          datasetId: res.dataset_id || shareTarget.dataset_id || "",
          datasetName: res.dataset_name || getDatasetLabel(shareTarget.dataset_id),
          targetUserId: u.id,
          targetUsername: u.username,
          promptShareMode: shareMode,
        });
        return;
      }
      setFeedback(`Prompt "${shareTarget.name}" compartido con @${u.username}.`);
      const updatedShares = await fetchPromptShares(shareTarget.id);
      setActivePromptShares(updatedShares);
      await loadData();
    } catch (err: any) {
      setError(err?.message || "Error compartiendo el prompt");
    } finally {
      setSharingUserId(null);
    }
  };

  const handleConfirmDatasetAndPromptShare = async () => {
    if (!datasetShareRequired) return;
    setConfirmingDatasetAndPrompt(true);
    setError(null);
    try {
      await shareSavedPrompt(datasetShareRequired.prompt.id, {
        target_user_id: datasetShareRequired.targetUserId,
        share_mode: datasetShareRequired.promptShareMode,
        dataset_share_mode: datasetShareMode,
      });
      setFeedback(
        `Dataset "${datasetShareRequired.datasetName}" y prompt "${datasetShareRequired.prompt.name}" compartidos con @${datasetShareRequired.targetUsername}.`
      );
      const pid = datasetShareRequired.prompt.id;
      setDatasetShareRequired(null);
      if (shareTarget && shareTarget.id === pid) {
        const updatedShares = await fetchPromptShares(pid);
        setActivePromptShares(updatedShares);
      }
      await loadData();
    } catch (err: any) {
      setError(err?.message || "Error compartiendo dataset y prompt");
    } finally {
      setConfirmingDatasetAndPrompt(false);
    }
  };

  const handleOpenDownload = (item: SavedPromptItem) => {
    const safeName = (item.name || "prompt").trim().replace(/[^\w\-. ]+/g, "_").replace(/\s+/g, "_");
    setDownloadTarget(item);
    setDownloadFileName(safeName || "prompt");
    setIncludeOutputAndSpec(false);
  };

  const handleConfirmDownload = (ext: "txt" | "md" | "json") => {
    if (!downloadTarget) return;
    const baseName = (downloadFileName.trim() || "prompt").replace(/\.(txt|md|json)$/i, "");
    const content = buildPromptDownloadContent(downloadTarget, ext, includeOutputAndSpec);
    const mime =
      ext === "json"
        ? "application/json;charset=utf-8"
        : ext === "md"
          ? "text/markdown;charset=utf-8"
          : "text/plain;charset=utf-8";
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `${baseName}.${ext}`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setDownloadTarget(null);
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [promptList, dsList] = await Promise.all([
        fetchSavedPrompts(),
        fetchDatasets(),
      ]);
      setPrompts(promptList);
      setDatasets(dsList);
    } catch (err: any) {
      setError(err?.message || "Error cargando los prompts guardados");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      setSelectedDatasetFilter(initialDatasetFilter || "all");
      setPreviewTarget(null);
      setEditTarget(null);
      setDeleteTarget(null);
      setFeedback(null);
      setSelectedDatasetFilter("all");
      void loadData();
    }
  }, [isOpen, loadData]);

  const datasetMap = useMemo(() => {
    const map = new Map<string, DatasetSummary>();
    for (const ds of datasets) map.set(ds.id, ds);
    return map;
  }, [datasets]);

  const taskDatasets = useMemo(
    () => datasets.filter((ds) => !ds.is_ground_truth),
    [datasets]
  );

  const filteredPrompts = useMemo(() => {
    if (selectedDatasetFilter === "all") return prompts;
    return prompts.filter((p) => p.dataset_id === selectedDatasetFilter);
  }, [prompts, selectedDatasetFilter]);

  const getDatasetLabel = (datasetId?: string | null) => {
    if (!datasetId) return "Sin dataset";
    return datasetMap.get(datasetId)?.name || datasetId;
  };

  const handleOpenEdit = (item: SavedPromptItem) => {
    setError(null);
    setFeedback(null);
    setPreviewTarget(null);
    setEditTarget(item);
    setEditName(item.name);
    setEditDatasetId(item.dataset_id || "");
    setEditSystemPrompt(item.system_prompt || "");
    setEditModelPrompt(item.model_prompt || "");
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTarget) return;
    setError(null);
    const cleanName = editName.trim();
    if (!cleanName) {
      setError("El título del prompt es obligatorio.");
      return;
    }
    if (!editModelPrompt.trim()) {
      setError("El Prompt del Modelo no puede estar vacío.");
      return;
    }
    setSavingEdit(true);
    try {
      const updated = await updateSavedPrompt(editTarget.id, {
        name: cleanName,
        dataset_id: editDatasetId || null,
        system_prompt: editSystemPrompt,
        model_prompt: editModelPrompt,
      });
      setPrompts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      setEditTarget(null);
      setFeedback(`Prompt "${updated.name}" actualizado correctamente.`);
    } catch (err: any) {
      setError(err?.message || "Error actualizando el prompt");
    } finally {
      setSavingEdit(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteSavedPrompt(deleteTarget.id);
      setPrompts((prev) => prev.filter((p) => p.id !== deleteTarget.id));
      if (previewTarget?.id === deleteTarget.id) setPreviewTarget(null);
      if (editTarget?.id === deleteTarget.id) setEditTarget(null);
      setFeedback(`Prompt "${deleteTarget.name}" eliminado correctamente.`);
      setDeleteTarget(null);
    } catch (err: any) {
      setError(err?.message || "Error eliminando el prompt");
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="sm:max-w-4xl max-h-[88vh] bg-card border-border rounded-sm shadow-none flex flex-col overflow-hidden">
          <DialogHeader className="border-b border-border pb-3 pr-6">
            <DialogTitle className="font-serif text-lg font-bold text-foreground flex items-center gap-2">
              <FileCode className="w-4 h-4 text-primary shrink-0" />
              <span>
                {previewTarget
                  ? previewTarget.name
                  : editTarget
                  ? `Editar prompt: ${editTarget.name}`
                  : "Prompts Almacenados"}
              </span>
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {previewTarget
                ? `Dataset asociado: ${getDatasetLabel(previewTarget.dataset_id)}`
                : editTarget
                ? "Modifica el título, el Prompt del Sistema o el Prompt del Modelo."
                : "Listado de prompts guardados asociados a cada Dataset de Tareas."}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-4 py-1 pr-1 min-w-0">
            {error && (
              <div className="p-2.5 rounded-sm bg-destructive/10 border border-destructive/30 flex items-center gap-2 text-xs text-destructive">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {feedback && (
              <div className="p-2.5 rounded-sm bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-700 dark:text-emerald-300">
                {feedback}
              </div>
            )}

            {previewTarget ? (
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                    Prompt del Sistema
                  </Label>
                  <pre className="p-3 rounded-sm border border-border bg-background text-xs font-mono whitespace-pre-wrap break-words max-h-40 overflow-y-auto leading-relaxed text-foreground">
                    {previewTarget.system_prompt || "—"}
                  </pre>
                </div>

                <div className="space-y-1">
                  <Label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                    Prompt del Modelo
                  </Label>
                  <pre className="p-3 rounded-sm border border-border bg-background text-xs font-mono whitespace-pre-wrap break-words max-h-72 overflow-y-auto leading-relaxed text-foreground">
                    {previewTarget.model_prompt}
                  </pre>
                </div>

                <div className="flex items-center justify-between gap-2 pt-2 border-t border-border">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setPreviewTarget(null)}
                    className="h-8 text-xs rounded-sm border-border gap-1.5"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Volver al listado</span>
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => handleOpenEdit(previewTarget)}
                    className="h-8 text-xs rounded-sm bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    <span>Editar</span>
                  </Button>
                </div>
              </div>
            ) : editTarget ? (
              <form onSubmit={handleSaveEdit} className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="edit-prompt-name" className="text-xs font-semibold text-foreground">
                    Título del prompt
                  </Label>
                  <Input
                    id="edit-prompt-name"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="h-9 text-xs bg-background border-border rounded-sm"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-foreground">
                    Dataset de Tareas asociado
                  </Label>
                  <Select value={editDatasetId || "none"} onValueChange={(v) => setEditDatasetId(v === "none" ? "" : v)}>
                    <SelectTrigger className="h-9 text-xs bg-background border-border rounded-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-border rounded-sm text-xs">
                      <SelectItem value="none">Sin dataset</SelectItem>
                      {taskDatasets.map((ds) => (
                        <SelectItem key={ds.id} value={ds.id}>
                          {ds.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="edit-prompt-system" className="text-xs font-semibold text-foreground">
                    Prompt del Sistema
                  </Label>
                  <Textarea
                    id="edit-prompt-system"
                    rows={4}
                    value={editSystemPrompt}
                    onChange={(e) => setEditSystemPrompt(e.target.value)}
                    className="font-mono text-xs bg-background border-border rounded-sm resize-y leading-relaxed"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="edit-prompt-model" className="text-xs font-semibold text-foreground">
                    Prompt del Modelo
                  </Label>
                  <Textarea
                    id="edit-prompt-model"
                    rows={10}
                    value={editModelPrompt}
                    onChange={(e) => setEditModelPrompt(e.target.value)}
                    className="font-mono text-xs bg-background border-border rounded-sm resize-y leading-relaxed"
                  />
                </div>

                <div className="flex items-center justify-between gap-2 pt-2 border-t border-border">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={savingEdit}
                    onClick={() => setEditTarget(null)}
                    className="h-8 text-xs rounded-sm border-border gap-1.5"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Cancelar</span>
                  </Button>
                  <Button
                    type="submit"
                    size="sm"
                    disabled={savingEdit}
                    className="h-8 text-xs rounded-sm bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5"
                  >
                    {savingEdit ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Guardando...</span>
                      </>
                    ) : (
                      <span>Guardar cambios</span>
                    )}
                  </Button>
                </div>
              </form>
            ) : (
              <>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-1">
                  {initialDatasetFilter && initialDatasetFilter !== "all" ? (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>Dataset de Tareas:</span>
                      <Badge
                        variant="outline"
                        className="text-[11px] font-mono rounded-sm border-border bg-muted/30 text-foreground gap-1"
                      >
                        <Database className="w-3 h-3 text-primary" />
                        <span>{getDatasetLabel(initialDatasetFilter)}</span>
                      </Badge>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>Filtrar por Dataset de Tareas:</span>
                      <div className="w-60">
                        <Select value={selectedDatasetFilter} onValueChange={setSelectedDatasetFilter}>
                          <SelectTrigger className="h-8 text-xs bg-background border-border rounded-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-card border-border rounded-sm text-xs">
                            <SelectItem value="all">Todos los datasets ({prompts.length})</SelectItem>
                            {taskDatasets.map((ds) => (
                              <SelectItem key={ds.id} value={ds.id}>
                                {ds.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}

                  <Badge variant="outline" className="text-[11px] font-mono rounded-sm self-start sm:self-auto">
                    {filteredPrompts.length} {filteredPrompts.length === 1 ? "prompt" : "prompts"}
                  </Badge>
                </div>

                {loading ? (
                  <div className="py-10 flex items-center justify-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin text-primary" />
                    <span>Cargando prompts...</span>
                  </div>
                ) : filteredPrompts.length === 0 ? (
                  <div className="py-10 text-center text-xs text-muted-foreground border border-dashed border-border rounded-sm">
                    No hay prompts guardados para este filtro.
                  </div>
                ) : (
                  <div className="border-t-2 border-b-2 border-foreground">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-b border-foreground hover:bg-transparent">
                          <TableHead className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                            Título
                          </TableHead>
                          <TableHead className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                            Dataset de Tareas
                          </TableHead>
                          <TableHead className="text-right text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                            Acciones
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredPrompts.map((item) => {
                          const linkedDs = datasets.find((d) => d.id === item.dataset_id);
                          const isSharedPrompt = Boolean(
                            item.is_shared ||
                            item.is_shared_by_owner ||
                            linkedDs?.is_shared ||
                            linkedDs?.is_shared_by_owner
                          );
                          const canEditPrompt = !item.is_shared || item.share_mode === "edit";
                          return (
                          <TableRow key={item.id} className="border-b border-border/60">
                            <TableCell className="py-2.5 text-xs font-semibold text-foreground">
                              <div className="flex items-center gap-1.5 min-w-0">
                                {isSharedPrompt && (
                                  <button
                                    type="button"
                                    onClick={() => setAccessModalPrompt(item)}
                                    title={
                                      item.shared_by
                                        ? `Compartido por @${item.shared_by}`
                                        : linkedDs?.shared_by
                                        ? `Compartido por @${linkedDs.shared_by}`
                                        : "Ver y gestionar accesos compartidos"
                                    }
                                    className="inline-flex items-center justify-center p-0.5 rounded-sm text-primary hover:bg-primary/10 transition-colors cursor-pointer shrink-0"
                                  >
                                    <Users className="w-3.5 h-3.5" />
                                  </button>
                                )}
                                <span className="truncate">{item.name}</span>
                              </div>
                            </TableCell>
                            <TableCell className="py-2.5">
                              <Badge
                                variant="outline"
                                className="text-[11px] font-mono rounded-sm border-border bg-muted/30 text-foreground gap-1"
                              >
                                <Database className="w-3 h-3 text-primary" />
                                <span>{getDatasetLabel(item.dataset_id)}</span>
                              </Badge>
                            </TableCell>
                            <TableCell className="py-2.5 text-right">
                              <div className="inline-flex items-center justify-end gap-1">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => setPreviewTarget(item)}
                                  className="h-7 w-7 rounded-sm text-muted-foreground hover:text-foreground hover:bg-muted"
                                  title="Ver prompt"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                </Button>
                                {canEditPrompt && (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleOpenEdit(item)}
                                    className="h-7 w-7 rounded-sm text-muted-foreground hover:text-primary hover:bg-primary/10"
                                    title="Editar prompt"
                                  >
                                    <Pencil className="w-3.5 h-3.5" />
                                  </Button>
                                )}
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleOpenDownload(item)}
                                  className="h-7 w-7 rounded-sm text-muted-foreground hover:text-primary hover:bg-primary/10"
                                  title="Descargar prompt"
                                >
                                  <Download className="w-3.5 h-3.5" />
                                </Button>
                                {!item.is_shared && (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleOpenSharePrompt(item)}
                                    className="h-7 w-7 rounded-sm text-muted-foreground hover:text-primary hover:bg-primary/10"
                                    title="Compartir prompt"
                                  >
                                    <Share2 className="w-3.5 h-3.5" />
                                  </Button>
                                )}
                                {!item.is_shared && (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => setDeleteTarget(item)}
                                    className="h-7 w-7 rounded-sm text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                    title="Eliminar prompt"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}

                <div className="flex justify-end pt-2 border-t border-border">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={onClose}
                    className="h-8 text-xs rounded-sm border-border"
                  >
                    Cerrar
                  </Button>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Download Prompt Dialog */}
      <Dialog open={Boolean(downloadTarget)} onOpenChange={(open) => !open && setDownloadTarget(null)}>
        <DialogContent className="sm:max-w-md bg-card border-border rounded-sm shadow-none">
          <DialogHeader className="border-b border-border pb-3">
            <DialogTitle className="font-serif text-base font-bold text-foreground flex items-center gap-2">
              <Download className="w-4 h-4 text-primary shrink-0" />
              <span>Descargar prompt</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Elige el nombre del archivo y pulsa en <strong>Descargar</strong> para elegir el formato (<code>.txt</code>, <code>.md</code> o <code>.json</code>).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="download-prompt-name" className="text-xs font-medium">
                Nombre del archivo
              </Label>
              <Input
                id="download-prompt-name"
                value={downloadFileName}
                onChange={(e) => setDownloadFileName(e.target.value)}
                placeholder="mi_prompt"
                className="h-8 text-xs font-mono rounded-sm"
              />
            </div>

            <label className="flex items-start gap-2 p-2.5 rounded-sm border border-border bg-muted/20 cursor-pointer hover:bg-muted/40 transition-colors">
              <input
                type="checkbox"
                checked={includeOutputAndSpec}
                onChange={(e) => setIncludeOutputAndSpec(e.target.checked)}
                className="mt-0.5 accent-primary"
              />
              <span className="text-xs leading-snug">
                <span className="font-medium text-foreground block">
                  Incluir JSON resultante y SPEC
                </span>
                <span className="text-[11px] text-muted-foreground">
                  Añade el esquema de salida (<code>output_schema</code>) y la especificación de evaluación (<code>evaluation-spec</code>) en la exportación.
                </span>
              </span>
            </label>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setDownloadTarget(null)}
              className="h-8 text-xs rounded-sm border-border"
            >
              Cancelar
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  size="sm"
                  disabled={!downloadFileName.trim()}
                  className="h-8 text-xs rounded-sm gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Descargar</span>
                  <ChevronDown className="w-3.5 h-3.5 opacity-80" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44 rounded-sm">
                <DropdownMenuItem
                  onClick={() => handleConfirmDownload("txt")}
                  className="text-xs font-mono cursor-pointer"
                >
                  Texto plano (.txt)
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => handleConfirmDownload("md")}
                  className="text-xs font-mono cursor-pointer"
                >
                  Markdown (.md)
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => handleConfirmDownload("json")}
                  className="text-xs font-mono cursor-pointer"
                >
                  JSON (.json)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </DialogContent>
      </Dialog>

      {/* Share Prompt Dialog */}
      <Dialog open={Boolean(shareTarget)} onOpenChange={(open) => !open && setShareTarget(null)}>
        <DialogContent className="sm:max-w-md bg-card border-border rounded-sm shadow-none">
          <DialogHeader className="border-b border-border pb-3">
            <DialogTitle className="font-serif text-base font-bold text-foreground flex items-center gap-2">
              <Share2 className="w-4 h-4 text-primary shrink-0" />
              <span>Compartir prompt</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Comparte <strong>{shareTarget?.name}</strong> con otros usuarios. Se verificará si el dataset asociado ya está compartido con el destinatario.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                Usuario destinatario
              </Label>
              <ShareUserPicker
                excludedUserIds={activePromptShares.map((sh) => sh.target_user_id)}
                selectedUserId={selectedShareUser?.id ?? ""}
                onSelectUser={(u) => setSelectedShareUser(u)}
              />
            </div>

            {selectedShareUser && (
              <div className="p-2.5 border border-primary/30 rounded-sm bg-primary/5 space-y-2.5">
                <Label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                  Modo de compartición del prompt · <strong className="text-foreground">@{selectedShareUser.username}</strong>
                </Label>
                <div className="flex items-center gap-2">
                  <Select value={shareMode} onValueChange={(v) => setShareMode(v as "view" | "edit" | "copy")}>
                    <SelectTrigger className="h-9 text-xs bg-background border-border rounded-sm flex-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-border rounded-sm shadow-none">
                      <SelectItem value="view" className="text-xs">Visualizar (solo lectura)</SelectItem>
                      <SelectItem value="edit" className="text-xs">Edición</SelectItem>
                      <SelectItem value="copy" className="text-xs">Copia independiente</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    size="sm"
                    disabled={sharingUserId === selectedShareUser.id}
                    onClick={async () => {
                      const target = selectedShareUser;
                      await handleSharePromptWithUser(target);
                      setSelectedShareUser(null);
                    }}
                    className="h-9 px-4 text-xs rounded-sm bg-primary text-primary-foreground hover:bg-primary/90 shrink-0"
                  >
                    {sharingUserId === selectedShareUser.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Compartir"}
                  </Button>
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end pt-2 border-t border-border">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShareTarget(null)}
              className="h-8 text-xs rounded-sm border-border"
            >
              Cerrar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dataset Dependency Warning Modal */}
      <Dialog
        open={Boolean(datasetShareRequired)}
        onOpenChange={(open) => !open && !confirmingDatasetAndPrompt && setDatasetShareRequired(null)}
      >
        <DialogContent className="sm:max-w-md bg-card border-border rounded-sm shadow-none">
          <DialogHeader className="border-b border-border pb-3">
            <DialogTitle className="font-serif text-base font-bold text-amber-600 dark:text-amber-400 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>Dataset asociado no compartido</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              El dataset <strong>{datasetShareRequired?.datasetName}</strong> asociado a este prompt aún no se ha compartido con{" "}
              <strong>@{datasetShareRequired?.targetUsername}</strong>. Para compartir el prompt, debes compartir también el dataset y elegir su modo de compartición.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-2">
            <Label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
              Modo de compartición del dataset
            </Label>
            <Select value={datasetShareMode} onValueChange={(v) => setDatasetShareMode(v as "view" | "edit" | "copy")}>
              <SelectTrigger className="h-9 text-xs bg-background border-border rounded-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-card border-border rounded-sm shadow-none">
                <SelectItem value="view" className="text-xs">Visualizar (solo lectura)</SelectItem>
                <SelectItem value="edit" className="text-xs">Edición</SelectItem>
                <SelectItem value="copy" className="text-xs">Copia independiente</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={confirmingDatasetAndPrompt}
              onClick={() => setDatasetShareRequired(null)}
              className="h-8 text-xs rounded-sm border-border"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={confirmingDatasetAndPrompt}
              onClick={handleConfirmDatasetAndPromptShare}
              className="h-8 text-xs rounded-sm gap-1.5"
            >
              {confirmingDatasetAndPrompt ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Compartiendo...</span>
                </>
              ) : (
                <span>Compartir dataset y prompt</span>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <SharedAccessModal
        isOpen={Boolean(accessModalPrompt)}
        onClose={() => setAccessModalPrompt(null)}
        resourceTypeLabel="Prompt"
        resourceName={accessModalPrompt?.name || ""}
        isOwner={Boolean(accessModalPrompt && !accessModalPrompt.is_shared && accessModalPrompt.is_shared_by_owner)}
        sharedBy={
          accessModalPrompt?.shared_by ||
          datasets.find((d) => d.id === accessModalPrompt?.dataset_id)?.shared_by
        }
        recipientShareMode={
          accessModalPrompt?.share_mode ||
          datasets.find((d) => d.id === accessModalPrompt?.dataset_id)?.share_mode
        }
        loadShares={
          accessModalPrompt && !accessModalPrompt.is_shared && accessModalPrompt.is_shared_by_owner
            ? () => fetchPromptShares(accessModalPrompt.id)
            : undefined
        }
        onUpdateShareMode={
          accessModalPrompt && !accessModalPrompt.is_shared && accessModalPrompt.is_shared_by_owner
            ? (shareId, mode) => updatePromptShareMode(accessModalPrompt.id, shareId, mode)
            : undefined
        }
        onRevokeShare={
          accessModalPrompt && !accessModalPrompt.is_shared && accessModalPrompt.is_shared_by_owner
            ? (shareId) => revokePromptShare(accessModalPrompt.id, shareId)
            : undefined
        }
        onChanged={loadData}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-md bg-card border-border rounded-sm shadow-none">
          <DialogHeader className="border-b border-border pb-3">
            <DialogTitle className="font-serif text-base font-bold text-destructive flex items-center gap-2">
              <Trash2 className="w-4 h-4 shrink-0" />
              <span>Eliminar prompt</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              ¿Seguro que deseas eliminar el prompt <strong>"{deleteTarget?.name}"</strong>? Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={deleting}
              onClick={() => setDeleteTarget(null)}
              className="h-8 text-xs rounded-sm border-border"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={deleting}
              onClick={handleConfirmDelete}
              className="h-8 text-xs rounded-sm gap-1.5"
            >
              {deleting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Eliminando...</span>
                </>
              ) : (
                <span>Eliminar</span>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
