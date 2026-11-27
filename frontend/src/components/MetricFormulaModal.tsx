import React from "react";
import { MetricCatalogItem } from "../types";
import { useTranslation } from "../i18n";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { BookOpen, FunctionSquare, CheckCircle2 } from "lucide-react";
import { MathFormula } from "./MathFormula";

interface MetricFormulaModalProps {
  metric: MetricCatalogItem | null;
  isOpen: boolean;
  onClose: () => void;
}

export const MetricFormulaModal: React.FC<MetricFormulaModalProps> = ({
  metric,
  isOpen,
  onClose,
}) => {
  const { t } = useTranslation();
  if (!metric) return null;

  const metricName = t(`metricCatalog.${metric.id}.name`) !== `metricCatalog.${metric.id}.name` ? t(`metricCatalog.${metric.id}.name`) : metric.name;
  const metricCat = t(`metricCatalog.${metric.id}.categoryLabel`) !== `metricCatalog.${metric.id}.categoryLabel` ? t(`metricCatalog.${metric.id}.categoryLabel`) : metric.categoryLabel;
  const metricDesc = t(`metricCatalog.${metric.id}.shortDesc`) !== `metricCatalog.${metric.id}.shortDesc` ? t(`metricCatalog.${metric.id}.shortDesc`) : metric.shortDesc;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl bg-card border border-border shadow-2xl p-0 overflow-hidden rounded-xl">
        {/* Header with category badge */}
        <DialogHeader className="p-5 pb-3 border-b border-border/70 bg-muted/20">
          <div className="flex items-center gap-2 mb-1.5">
            <Badge variant="outline" className="text-[10px] font-mono uppercase bg-background/80 text-primary border-primary/30">
              {metricCat}
            </Badge>
            <span className="text-xs text-muted-foreground font-mono">ID: {metric.id}</span>
          </div>
          <DialogTitle className="text-base font-semibold tracking-tight text-foreground flex items-center gap-2">
            <FunctionSquare className="w-5 h-5 text-primary" />
            <span>{metricName}</span>
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground leading-relaxed mt-1">
            {metricDesc}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[70vh] p-5 space-y-5">
          {/* Mathematical Formula Card */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono font-bold uppercase text-muted-foreground tracking-wider flex items-center gap-1.5">
                <FunctionSquare className="w-3.5 h-3.5 text-primary" />
                <span>{t("metricModal.formulaTitle")}</span>
              </span>
              <Badge variant="secondary" className="text-[10px] font-mono py-0">
                {metric.higherIsBetter ? t("metricModal.higherBetter") : t("metricModal.lowerBetter")}
              </Badge>
            </div>

            <div className="p-4 rounded-none bg-muted/60 border-t-2 border-b-2 border-foreground/80 border-x border-x-border text-foreground overflow-x-auto leading-relaxed flex items-center justify-center min-h-[75px]">
              <MathFormula
                math={metric.formulaTex}
                displayMode={true}
                className="text-primary font-semibold tracking-wide text-base select-all"
              />
            </div>
          </div>

          {/* Variables and Parameters Definition */}
          {metric.variables && metric.variables.length > 0 && (
            <div className="space-y-2 pt-2">
              <span className="text-[11px] font-mono font-bold uppercase text-muted-foreground tracking-wider block">
                {t("metricModal.variablesTitle")}
              </span>
              <div className="grid grid-cols-1 gap-2">
                {metric.variables.map((v, i) => (
                  <div
                    key={i}
                    className="p-2.5 rounded-md bg-muted/30 border border-border/60 flex items-start gap-3 text-xs"
                  >
                    <span className="px-2 py-0.5 rounded bg-background font-mono font-bold text-foreground shrink-0 border border-border/80 flex items-center justify-center min-w-[28px]">
                      <MathFormula math={v.symbol} displayMode={false} />
                    </span>
                    <span className="text-muted-foreground leading-relaxed">{v.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Interpretation Guide / Thresholds */}
          {metric.interpretation && metric.interpretation.length > 0 && (
            <div className="space-y-2 pt-2">
              <span className="text-[11px] font-mono font-bold uppercase text-muted-foreground tracking-wider block">
                {t("metricModal.interpretationTitle")}
              </span>
              <div className="space-y-1.5">
                {metric.interpretation.map((item, idx) => (
                  <div
                    key={idx}
                    className="p-2.5 rounded-md bg-card border border-border/70 flex items-center justify-between gap-3 text-xs"
                  >
                    <span className="font-mono font-semibold text-foreground">{item.range}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground text-xs">{item.label}</span>
                      <CheckCircle2 className="w-3.5 h-3.5 text-muted-foreground" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Academic / Scientific Citation */}
          {metric.citation && (
            <div className="pt-2">
              <div className="p-3.5 rounded-lg bg-muted/20 border border-border flex items-start gap-3">
                <BookOpen className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                <div className="space-y-1 text-xs">
                  <span className="font-semibold text-foreground block">
                    {t("metricModal.academicCitation")}
                  </span>
                  <p className="text-muted-foreground leading-relaxed italic text-[11px]">
                    {metric.citation}
                  </p>
                </div>
              </div>
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};

export default MetricFormulaModal;
