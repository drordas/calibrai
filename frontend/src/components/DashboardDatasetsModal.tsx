import React, { useCallback, useEffect, useState } from "react";
import { DatasetSummary, PaginatedRowsResponse, ShareEntry, ShareUser } from "../types";
import {
  deleteDataset,
  exportDataset,
  fetchDatasets,
  fetchDatasetShares,
  fetchPaginatedRows,
  fetchShareableUsers,
  respondToDatasetShare,
  revokeDatasetShare,
  shareDatasetWithUser,
  uploadDataset,
} from "../services/api";
import { useTranslation } from "../i18n";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Database,
  Download,
  Eye,
  Loader2,
  Plus,
  Share2,
  ShieldCheck,
  Trash2,
  Upload,
  Users,
  X,
} from "lucide-react";

interface DashboardDatasetsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export const DashboardDatasetsModal: React.FC<DashboardDatasetsModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { t } = useTranslation();
  const [datasets, setDatasets] = useState<DatasetSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Preview state
  const [previewDataset, setPreviewDataset] = useState<DatasetSummary | null>(null);
  const [previewRows, setPreviewRows] = useState<PaginatedRowsResponse | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Delete state
  const [deleteTarget, setDeleteTarget] = useState<DatasetSummary | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Share state
  const [shareTarget, setShareTarget] = useState<DatasetSummary | null>(null);
  const [shareMode, setShareMode] = useState<"view" | "edit" | "copy">("view");
  const [shareUsers, setShareUsers] = useState<ShareUser[]>([]);
  const [activeShares, setActiveShares] = useState<ShareEntry[]>([]);
  const [shareUsersLoading, setShareUsersLoading] = useState(false);
  const [sharingUserId, setSharingUserId] = useState<number | null>(null);
  const [revokingShareId, setRevokingShareId] = useState<number | null>(null);

  // Respond to incoming share
  const [respondingShareId, setRespondingShareId] = useState<number | null>(null);

  // Upload dataset state
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadType, setUploadType] = useState<"task" | "ground_truth">("task");
  const [uploadName, setUploadName] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  // Export state
  const [exportingId, setExportingId] = useState<string | null>(null);

  const loadDatasets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchDatasets();
      setDatasets(data);
    } catch (err: any) {
      setError(err?.message || t("common.error"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (!isOpen) return;
    setFeedback(null);
    loadDatasets();
  }, [isOpen, loadDatasets]);

  const handleOpenPreview = async (ds: DatasetSummary) => {
    setPreviewDataset(ds);
    setPreviewRows(null);
    setPreviewLoading(true);
    try {
      const rows = await fetchPaginatedRows(ds.id, 0, 25);
      setPreviewRows(rows);
    } catch (err: any) {
      setError(err?.message || t("common.error"));
      setPreviewDataset(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteDataset(deleteTarget.id);
      setDeleteTarget(null);
      await loadDatasets();
    } catch (err: any) {
      setDeleteTarget(null);
      setError(err?.message || t("common.error"));
    } finally {
      setDeleting(false);
    }
  };

  const handleOpenShare = async (ds: DatasetSummary) => {
    setShareTarget(ds);
    setShareMode("view");
    setShareUsers([]);
    setActiveShares([]);
    setShareUsersLoading(true);
    setError(null);
    try {
      const [users, shares] = await Promise.all([
        fetchShareableUsers(),
        fetchDatasetShares(ds.id).catch(() => []),
      ]);
      setShareUsers(users);
      setActiveShares(shares);
    } catch (err: any) {
      setError(err?.message || t("common.error"));
      setShareTarget(null);
    } finally {
      setShareUsersLoading(false);
    }
  };

  const handleShareWithUser = async (targetUser: ShareUser) => {
    if (!shareTarget) return;
    setSharingUserId(targetUser.id);
    setError(null);
    try {
      await shareDatasetWithUser(shareTarget.id, targetUser.id, shareMode);
      setShareTarget(null);
      setFeedback(t("dashboardDatasets.shareSuccess", { username: targetUser.username }));
      await loadDatasets();
    } catch (err: any) {
      setError(err?.message || t("common.error"));
    } finally {
      setSharingUserId(null);
    }
  };

  const handleRevokeShare = async (shareId: number) => {
    if (!shareTarget) return;
    setRevokingShareId(shareId);
    try {
      await revokeDatasetShare(shareTarget.id, shareId);
      setActiveShares((prev) => prev.filter((s) => s.id !== shareId));
      await loadDatasets();
    } catch (err: any) {
      setError(err?.message || t("common.error"));
    } finally {
      setRevokingShareId(null);
    }
  };

  const handleRespondShare = async (shareId: number, accept: boolean) => {
    setRespondingShareId(shareId);
    setError(null);
    try {
      await respondToDatasetShare(shareId, accept);
      await loadDatasets();
    } catch (err: any) {
      setError(err?.message || t("common.error"));
    } finally {
      setRespondingShareId(null);
    }
  };

  const handleExport = async (ds: DatasetSummary, format: "csv" | "json") => {
    setExportingId(ds.id);
    setError(null);
    try {
      await exportDataset(ds.id, format, ds.name || ds.id);
    } catch (err: any) {
      setError(err?.message || t("common.error"));
    } finally {
      setExportingId(null);
    }
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile) return;
    setUploading(true);
    setError(null);
    try {
      await uploadDataset(
        uploadFile,
        uploadName.trim() || undefined,
        undefined,
        uploadType === "ground_truth"
      );
      setShowUploadModal(false);
      setUploadFile(null);
      setUploadName("");
      setUploadType("task");
      setFeedback(t("dashboardDatasets.uploadSuccess"));
      await loadDatasets();
    } catch (err: any) {
      setError(err?.message || t("common.error"));
    } finally {
      setUploading(false);
    }
  };

  const getModeLabel = (mode?: string | null) => {
    if (mode === "edit") return t("dashboardDatasets.modeShortEdit");
    if (mode === "copy") return t("dashboardDatasets.modeShortCopy");
    return t("dashboardDatasets.modeShortView");
  };

  const corpusDatasets = datasets.filter((ds) => !ds.is_ground_truth);
  const groundTruthDatasets = datasets.filter((ds) => Boolean(ds.is_ground_truth));

  const renderDatasetTable = (items: DatasetSummary[]) => (
    <div className="border-t-2 border-b-2 border-foreground bg-card">
      <Table className="table-fixed w-full">
        <colgroup>
          <col className="w-[34%]" />
          <col className="w-[10%]" />
          <col className="w-[9%]" />
          <col className="w-[10%]" />
          <col className="w-[12%]" />
          <col className="w-[25%]" />
        </colgroup>
        <TableHeader>
          <TableRow className="border-b border-border hover:bg-transparent">
            <TableHead className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground h-9">
              {t("dashboardDatasets.colName")}
            </TableHead>
            <TableHead className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground h-9">
              {t("dashboardDatasets.colFormat")}
            </TableHead>
            <TableHead className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground h-9 text-right">
              {t("dashboardDatasets.colRows")}
            </TableHead>
            <TableHead className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground h-9 text-right">
              {t("dashboardDatasets.colCols")}
            </TableHead>
            <TableHead className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground h-9 text-right">
              {t("dashboardDatasets.colSize")}
            </TableHead>
            <TableHead className="h-9 text-right" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.length === 0 ? (
            <TableRow className="hover:bg-transparent">
              <TableCell
                colSpan={6}
                className="py-6 text-center text-xs text-muted-foreground"
              >
                {t("dashboardDatasets.noDatasetsAvailable")}
              </TableCell>
            </TableRow>
          ) : (
            items.map((ds) => {
              const isPendingShare = ds.is_shared && ds.share_status === "pending";
              const isSharedAny = Boolean(ds.is_shared || ds.is_shared_by_owner);
              return (
                <TableRow key={ds.id} className="border-b border-border/60">
                  <TableCell className="py-2.5">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {isSharedAny && (
                        <span
                          title={
                            ds.shared_by
                              ? t("dashboardDatasets.sharedBy", { username: ds.shared_by })
                              : t("dashboardDatasets.sharedBadge")
                          }
                          className="inline-flex items-center text-primary shrink-0"
                        >
                          <Users className="w-3.5 h-3.5" />
                        </span>
                      )}
                      <span className="font-medium text-xs text-foreground truncate">{ds.name}</span>
                      {ds.is_shared && (
                        <Badge
                          variant="outline"
                          className="text-[10px] font-mono rounded-sm border-primary/40 text-primary bg-primary/5"
                          title={ds.shared_by ? t("dashboardDatasets.sharedBy", { username: ds.shared_by }) : undefined}
                        >
                          {t("dashboardDatasets.sharedBadge")}
                          {ds.share_mode ? ` · ${getModeLabel(ds.share_mode)}` : ""}
                        </Badge>
                      )}
                    </div>
                    <div className="text-[11px] font-mono text-muted-foreground truncate">
                      {ds.filename}
                    </div>
                  </TableCell>
                  <TableCell className="py-2.5">
                    <Badge variant="outline" className="text-[10px] font-mono uppercase rounded-sm border-border">
                      {ds.format}
                    </Badge>
                  </TableCell>
                  <TableCell className="py-2.5 text-right font-mono text-xs tabular-nums">
                    {ds.total_rows.toLocaleString()}
                  </TableCell>
                  <TableCell className="py-2.5 text-right font-mono text-xs tabular-nums">
                    {ds.columns?.length || 0}
                  </TableCell>
                  <TableCell className="py-2.5 text-right font-mono text-xs tabular-nums text-muted-foreground">
                    {formatBytes(ds.size_bytes)}
                  </TableCell>
                  <TableCell className="py-2.5 text-right">
                    <div className="inline-flex items-center justify-end gap-1">
                      {isPendingShare && ds.share_id ? (
                        <>
                          <Button
                            type="button"
                            size="sm"
                            disabled={respondingShareId === ds.share_id}
                            onClick={() => handleRespondShare(ds.share_id!, true)}
                            className="h-7 px-2 text-[11px] rounded-sm bg-primary text-primary-foreground hover:bg-primary/90 gap-1"
                            title={t("dashboardDatasets.acceptShare")}
                          >
                            <Check className="w-3 h-3" />
                            <span>{t("dashboardDatasets.acceptShare")}</span>
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={respondingShareId === ds.share_id}
                            onClick={() => handleRespondShare(ds.share_id!, false)}
                            className="h-7 px-2 text-[11px] rounded-sm border-border text-muted-foreground hover:text-destructive gap-1"
                            title={t("dashboardDatasets.rejectShare")}
                          >
                            <X className="w-3 h-3" />
                            <span>{t("dashboardDatasets.rejectShare")}</span>
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => handleOpenPreview(ds)}
                            className="h-7 w-7 rounded-sm text-muted-foreground hover:text-foreground hover:bg-muted"
                            title={t("dashboardDatasets.viewTooltip")}
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                disabled={exportingId === ds.id}
                                className="h-7 w-7 rounded-sm text-muted-foreground hover:text-foreground hover:bg-muted"
                                title={t("dashboardDatasets.exportTooltip")}
                              >
                                {exportingId === ds.id ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <Download className="w-3.5 h-3.5" />
                                )}
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="bg-card border-border rounded-sm shadow-none p-1">
                              <DropdownMenuItem
                                onClick={() => handleExport(ds, "csv")}
                                className="text-xs cursor-pointer rounded-sm"
                              >
                                {t("dashboardDatasets.exportCsv")}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleExport(ds, "json")}
                                className="text-xs cursor-pointer rounded-sm"
                              >
                                {t("dashboardDatasets.exportJson")}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => handleOpenShare(ds)}
                            className="h-7 w-7 rounded-sm text-muted-foreground hover:text-primary hover:bg-primary/10"
                            title={t("dashboardDatasets.shareTooltip")}
                          >
                            <Share2 className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => setDeleteTarget(ds)}
                            className="h-7 w-7 rounded-sm text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                            title={t("dashboardDatasets.deleteTooltip")}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="sm:max-w-4xl bg-card border-border rounded-sm shadow-none">
          <DialogHeader className="border-b border-border pb-3">
            <DialogTitle className="font-serif text-lg font-bold text-foreground flex items-center gap-2">
              <Database className="w-4 h-4 text-primary" />
              {t("dashboardDatasets.modalTitle")}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {t("dashboardDatasets.modalDesc")}
            </DialogDescription>
          </DialogHeader>

          {error && (
            <div className="p-2.5 rounded-sm bg-destructive/10 border border-destructive/30 flex items-center gap-2 text-xs text-destructive">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {feedback && (
            <div className="p-2.5 rounded-sm bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{feedback}</span>
            </div>
          )}

          <div className="max-h-[65vh] overflow-y-auto pr-1">
            {loading ? (
              <div className="py-10 flex items-center justify-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin text-primary" />
                <span>{t("common.loading")}</span>
              </div>
            ) : (
              <div className="space-y-6 py-2">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-serif font-bold text-foreground flex items-center gap-1.5">
                      <Database className="w-3.5 h-3.5 text-primary" />
                      {t("dashboardDatasets.taskDatasetsTitle")}
                    </h4>
                    <Badge variant="outline" className="font-mono text-[10px] rounded-sm tabular-nums">
                      {corpusDatasets.length}
                    </Badge>
                  </div>
                  {renderDatasetTable(corpusDatasets)}
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-serif font-bold text-foreground flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-primary" />
                      {t("dashboardDatasets.groundTruthDatasetsTitle")}
                    </h4>
                    <Badge variant="outline" className="font-mono text-[10px] rounded-sm tabular-nums">
                      {groundTruthDatasets.length}
                    </Badge>
                  </div>
                  {renderDatasetTable(groundTruthDatasets)}
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-2 pt-2 border-t border-border">
            <Button
              type="button"
              size="sm"
              onClick={() => {
                setUploadFile(null);
                setUploadName("");
                setUploadType("task");
                setShowUploadModal(true);
              }}
              className="h-8 text-xs rounded-sm bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{t("dashboardDatasets.uploadBtn")}</span>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              className="h-8 text-xs rounded-sm border-border"
            >
              {t("common.close")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dataset Preview Dialog */}
      <Dialog open={Boolean(previewDataset)} onOpenChange={(open) => !open && setPreviewDataset(null)}>
        <DialogContent className="sm:max-w-5xl bg-card border-border rounded-sm shadow-none">
          <DialogHeader className="border-b border-border pb-3">
            <DialogTitle className="font-serif text-base font-bold text-foreground flex items-center gap-2">
              <Eye className="w-4 h-4 text-primary" />
              {t("dashboardDatasets.previewTitle")}: {previewDataset?.name}
            </DialogTitle>
            <DialogDescription className="text-xs font-mono text-muted-foreground">
              {previewRows
                ? t("dashboardDatasets.previewRowsInfo", {
                    shown: previewRows.rows.length,
                    total: previewRows.total_rows,
                  })
                : previewDataset?.filename}
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[60vh] overflow-auto border-t-2 border-b-2 border-foreground">
            {previewLoading ? (
              <div className="py-10 flex items-center justify-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin text-primary" />
                <span>{t("common.loading")}</span>
              </div>
            ) : previewRows ? (
              <Table>
                <TableHeader>
                  <TableRow className="border-b border-border hover:bg-transparent">
                    {previewRows.columns.map((col) => (
                      <TableHead
                        key={col}
                        className="text-[11px] font-mono text-muted-foreground whitespace-nowrap h-8"
                      >
                        {col}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {previewRows.rows.map((row, idx) => (
                    <TableRow key={idx} className="border-b border-border/50">
                      {previewRows.columns.map((col) => {
                        const val = row[col];
                        const display =
                          val === null || val === undefined
                            ? ""
                            : typeof val === "object"
                              ? JSON.stringify(val)
                              : String(val);
                        return (
                          <TableCell
                            key={col}
                            className="py-2 text-xs max-w-[260px] truncate align-top"
                            title={display}
                          >
                            {display}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : null}
          </div>

          <div className="flex justify-end pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPreviewDataset(null)}
              className="h-8 text-xs rounded-sm border-border"
            >
              {t("common.close")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-md bg-card border-border rounded-sm shadow-none">
          <DialogHeader className="border-b border-border pb-3">
            <DialogTitle className="font-serif text-base font-bold text-destructive flex items-center gap-2">
              <Trash2 className="w-4 h-4" />
              {t("dashboardDatasets.deleteTitle")}
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs text-foreground leading-relaxed py-2">
            {t("dashboardDatasets.deleteWarning", { name: deleteTarget?.name || "" })}
          </p>
          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setDeleteTarget(null)}
              disabled={deleting}
              className="h-8 text-xs rounded-sm border-border"
            >
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={handleConfirmDelete}
              disabled={deleting}
              className="h-8 text-xs rounded-sm gap-1.5"
            >
              {deleting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>{t("dashboardDatasets.deleting")}</span>
                </>
              ) : (
                t("dashboardDatasets.deleteConfirm")
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Share Dataset Dialog */}
      <Dialog open={Boolean(shareTarget)} onOpenChange={(open) => !open && setShareTarget(null)}>
        <DialogContent className="sm:max-w-md bg-card border-border rounded-sm shadow-none">
          <DialogHeader className="border-b border-border pb-3">
            <DialogTitle className="font-serif text-base font-bold text-foreground flex items-center gap-2">
              <Share2 className="w-4 h-4 text-primary" />
              {t("dashboardDatasets.shareTitle")}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {t("dashboardDatasets.shareDesc", { name: shareTarget?.name || "" })}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                {t("dashboardDatasets.shareModeLabel")}
              </Label>
              <Select value={shareMode} onValueChange={(v) => setShareMode(v as "view" | "edit" | "copy")}>
                <SelectTrigger className="h-9 text-xs bg-background border-border rounded-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-card border-border rounded-sm shadow-none">
                  <SelectItem value="view" className="text-xs">{t("dashboardDatasets.modeView")}</SelectItem>
                  <SelectItem value="edit" className="text-xs">{t("dashboardDatasets.modeEdit")}</SelectItem>
                  <SelectItem value="copy" className="text-xs">{t("dashboardDatasets.modeCopy")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {activeShares.length > 0 && (
              <div className="space-y-1.5 border-t border-border pt-3">
                <Label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                  {t("dashboardDatasets.sharedWithTitle")}
                </Label>
                <div className="space-y-1.5 max-h-28 overflow-y-auto">
                  {activeShares.map((sh) => (
                    <div
                      key={sh.id}
                      className="flex items-center justify-between gap-2 px-2.5 py-1.5 border border-border rounded-sm bg-muted/30"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-xs font-mono truncate">@{sh.target_username}</span>
                        <Badge variant="outline" className="text-[10px] font-mono rounded-sm">
                          {getModeLabel(sh.share_mode)}
                        </Badge>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        disabled={revokingShareId === sh.id}
                        onClick={() => handleRevokeShare(sh.id)}
                        className="h-6 w-6 text-muted-foreground hover:text-destructive"
                        title={t("dashboardDatasets.revokeShareTooltip")}
                      >
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="max-h-[35vh] overflow-y-auto space-y-2 border-t border-border pt-3">
              {shareUsersLoading ? (
                <div className="py-6 flex items-center justify-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin text-primary" />
                  <span>{t("common.loading")}</span>
                </div>
              ) : shareUsers.length === 0 ? (
                <div className="py-6 text-center text-xs text-muted-foreground">
                  {t("dashboardDatasets.shareNoUsers")}
                </div>
              ) : (
                shareUsers.map((u) => (
                  <div
                    key={u.id}
                    className="flex items-center justify-between gap-3 p-2.5 border border-border rounded-sm bg-background"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-mono font-medium text-foreground truncate">
                        @{u.username}
                      </div>
                      {u.full_name && (
                        <div className="text-[11px] text-muted-foreground truncate">
                          {u.full_name}
                        </div>
                      )}
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      disabled={sharingUserId === u.id}
                      onClick={() => handleShareWithUser(u)}
                      className="h-7 px-3 text-xs rounded-sm bg-primary text-primary-foreground hover:bg-primary/90 shrink-0"
                    >
                      {sharingUserId === u.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        t("dashboardDatasets.shareBtn")
                      )}
                    </Button>
                  </div>
                ))
              )}
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
              {t("common.close")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Upload Dataset Dialog */}
      <Dialog open={showUploadModal} onOpenChange={(open) => !open && setShowUploadModal(false)}>
        <DialogContent className="sm:max-w-md bg-card border-border rounded-sm shadow-none">
          <DialogHeader className="border-b border-border pb-3">
            <DialogTitle className="font-serif text-base font-bold text-foreground flex items-center gap-2">
              <Upload className="w-4 h-4 text-primary" />
              {t("dashboardDatasets.uploadTitle")}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {t("dashboardDatasets.uploadDesc")}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleUploadSubmit} className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                {t("dashboardDatasets.uploadTypeLabel")}
              </Label>
              <Select value={uploadType} onValueChange={(v) => setUploadType(v as "task" | "ground_truth")}>
                <SelectTrigger className="h-9 text-xs bg-background border-border rounded-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-card border-border rounded-sm shadow-none">
                  <SelectItem value="task" className="text-xs">{t("dashboardDatasets.uploadTypeTask")}</SelectItem>
                  <SelectItem value="ground_truth" className="text-xs">{t("dashboardDatasets.uploadTypeGroundTruth")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="upload-ds-name" className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                {t("dashboardDatasets.uploadNameLabel")}
              </Label>
              <Input
                id="upload-ds-name"
                type="text"
                value={uploadName}
                onChange={(e) => setUploadName(e.target.value)}
                placeholder={t("dashboardDatasets.uploadNamePlaceholder")}
                className="h-9 text-xs bg-background border-border rounded-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="upload-ds-file" className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                {t("dashboardDatasets.uploadFileLabel")}
              </Label>
              <Input
                id="upload-ds-file"
                type="file"
                accept=".csv,.json,.jsonl,.xlsx,.xls"
                onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                required
                className="h-9 text-xs bg-background border-border rounded-sm file:mr-2 file:text-xs file:font-medium file:text-primary"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowUploadModal(false)}
                disabled={uploading}
                className="h-8 text-xs rounded-sm border-border"
              >
                {t("common.cancel")}
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={uploading || !uploadFile}
                className="h-8 text-xs rounded-sm bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5"
              >
                {uploading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>{t("dashboardDatasets.uploading")}</span>
                  </>
                ) : (
                  <>
                    <Upload className="w-3.5 h-3.5" />
                    <span>{t("dashboardDatasets.uploadBtn")}</span>
                  </>
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
};
