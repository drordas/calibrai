import React, { useEffect, useState } from "react";
import { DatasetSummary } from "../types";
import { fetchDatasets } from "../services/api";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertCircle, Database, Loader2, ShieldCheck } from "lucide-react";

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

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchDatasets()
      .then((data) => {
        if (!cancelled) setDatasets(data);
      })
      .catch((err: any) => {
        if (!cancelled) setError(err?.message || t("common.error"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, t]);

  const corpusDatasets = datasets.filter((ds) => !ds.is_ground_truth);
  const groundTruthDatasets = datasets.filter((ds) => Boolean(ds.is_ground_truth));

  const renderDatasetTable = (items: DatasetSummary[]) => (
    <div className="border-t-2 border-b-2 border-foreground bg-card">
      <Table>
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
            <TableHead className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground h-9">
              {t("dashboardDatasets.colOrigin")}
            </TableHead>
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
            items.map((ds) => (
              <TableRow key={ds.id} className="border-b border-border/60">
                <TableCell className="py-2.5">
                  <div className="font-medium text-xs text-foreground">{ds.name}</div>
                  <div className="text-[11px] font-mono text-muted-foreground truncate max-w-[240px]">
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
                <TableCell className="py-2.5">
                  <Badge
                    variant="outline"
                    className={`text-[10px] font-mono rounded-sm ${
                      ds.is_sample
                        ? "border-border text-muted-foreground"
                        : "border-primary/40 text-primary bg-primary/5"
                    }`}
                  >
                    {ds.is_sample
                      ? t("dashboardDatasets.originSample")
                      : t("dashboardDatasets.originUploaded")}
                  </Badge>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );

  return (
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

        <div className="max-h-[65vh] overflow-y-auto pr-1">
          {loading ? (
            <div className="py-10 flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
              <span>{t("common.loading")}</span>
            </div>
          ) : error ? (
            <div className="p-3 rounded-sm bg-destructive/10 border border-destructive/30 flex items-center gap-2 text-xs text-destructive">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
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

        <div className="flex justify-end pt-2 border-t border-border">
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
  );
};
