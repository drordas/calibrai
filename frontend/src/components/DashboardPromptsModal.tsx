import React, { useCallback, useEffect, useMemo, useState } from "react";
import { DatasetSummary, ShareUser } from "../types";
import {
  deleteSavedPrompt,
  fetchDatasets,
  fetchPromptShares,
  fetchSavedPrompts,
  fetchShareableUsers,
  PromptShareEntry,
  revokePromptShare,
  SavedPromptItem,
  shareSavedPrompt,
  updatePromptShareMode,
  updateSavedPrompt,
} from "../services/api";
import { SharedAccessModal } from "./SharedAccessModal";
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
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertCircle,
  ArrowLeft,
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

function buildPromptDownloadContent(item: SavedPromptItem, format: "txt" | "md"): string {
  const sys = (item.system_prompt || "").trim();
  const body = (item.model_prompt || "").trim();

  if (format === "txt") {
    if (!sys) return body;
    return `=== SYSTEM PROMPT ===\n${sys}\n\n=== PLANTILLA DE PROMPT ===\n${body}\n`;
  }

  const mdBody = convertPromptTextIfNeeded(body);
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
  const [downloadFormat, setDownloadFormat] = useState<"txt" | "md">("txt");

  // Share prompt state
  const [shareTarget, setShareTarget] = useState<SavedPromptItem | null>(null);
  const [shareMode, setShareMode] = useState<"view" | "edit" | "copy">("view");
  const [shareUsers, setShareUsers] = useState<ShareUser[]>([]);
  const [activePromptShares, setActivePromptShares] = useState<PromptShareEntry[]>([]);
  const [shareUsersLoading, setShareUsersLoading] = useState(false);
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
    setShareUsersLoading(true);
    setError(null);
    try {
      const [users, shares] = await Promise.all([
        fetchShareableUsers(),
        fetchPromptShares(item.id),
      ]);
      setShareUsers(users);
      setActivePromptShares(shares);
    } catch (err: any) {
      setError(err?.message || "Error cargando usuarios para compartir");
    } finally {
      setShareUsersLoading(false);
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
    setDownloadFormat("txt");
  };

  const handleConfirmDownload = () => {
    if (!downloadTarget) return;
    const baseName = (downloadFileName.trim() || "prompt").replace(/\.(txt|md)$/i, "");
    const ext = downloadFormat;
    const content = buildPromptDownloadContent(downloadTarget, ext);
    const mime = ext === "md" ? "text/markdown;charset=utf-8" : "text/plain;charset=utf-8";
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
              Elige el nombre del archivo y el formato de exportación. Si eliges Markdown (<code>.md</code>), el contenido en texto plano se convertirá automáticamente a formato Markdown.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="download-prompt-name" className="text-xs font-medium">
                Nombre del archivo
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id="download-prompt-name"
                  value={downloadFileName}
                  onChange={(e) => setDownloadFileName(e.target.value)}
                  placeholder="mi_prompt"
                  className="h-8 text-xs font-mono rounded-sm"
                />
                <span className="text-xs font-mono text-muted-foreground shrink-0">.{downloadFormat}</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Formato</Label>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={downloadFormat === "txt" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setDownloadFormat("txt")}
                  className="h-8 text-xs font-mono rounded-sm"
                >
                  Texto plano (.txt)
                </Button>
                <Button
                  type="button"
                  variant={downloadFormat === "md" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setDownloadFormat("md")}
                  className="h-8 text-xs font-mono rounded-sm"
                >
                  Markdown (.md)
                </Button>
              </div>
            </div>
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
            <Button
              type="button"
              size="sm"
              onClick={handleConfirmDownload}
              disabled={!downloadFileName.trim()}
              className="h-8 text-xs rounded-sm gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Descargar .{downloadFormat}</span>
            </Button>
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
                Modo de compartición del prompt
              </Label>
              <Select value={shareMode} onValueChange={(v) => setShareMode(v as "view" | "edit" | "copy")}>
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

            <div className="max-h-[35vh] overflow-y-auto space-y-2 border-t border-border pt-3">
              {shareUsersLoading ? (
                <div className="py-6 flex items-center justify-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin text-primary" />
                  <span>Cargando usuarios...</span>
                </div>
              ) : (() => {
                const available = shareUsers.filter(
                  (u) => !activePromptShares.some((sh) => sh.target_user_id === u.id)
                );
                if (available.length === 0) {
                  return (
                    <div className="py-6 text-center text-xs text-muted-foreground">
                      No hay más usuarios disponibles para compartir.
                    </div>
                  );
                }
                return available.map((u) => (
                  <div
                    key={u.id}
                    className="flex items-center justify-between gap-3 p-2.5 border border-border rounded-sm bg-background"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-mono font-medium text-foreground truncate">@{u.username}</div>
                      {u.full_name && <div className="text-[11px] text-muted-foreground truncate">{u.full_name}</div>}
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      disabled={sharingUserId === u.id}
                      onClick={() => handleSharePromptWithUser(u)}
                      className="h-7 px-3 text-xs rounded-sm bg-primary text-primary-foreground hover:bg-primary/90 shrink-0"
                    >
                      {sharingUserId === u.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Compartir"}
                    </Button>
                  </div>
                ));
              })()}
            </div>
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
