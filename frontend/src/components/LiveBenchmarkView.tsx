import React from "react";
import {
  Activity,
  Layers,
} from "lucide-react";
import { useTranslation } from "../i18n";
import {
  Card,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

interface LiveBenchmarkViewProps {
  currentModel: string;
  modelIndex: number;
  totalModels: number;
  sampleIndex: number;
  totalSamples: number;
  latestResult: any;
  isRunning: boolean;
}

export const LiveBenchmarkView: React.FC<LiveBenchmarkViewProps> = ({
  currentModel,
  modelIndex,
  totalModels,
  sampleIndex,
  totalSamples,
  latestResult,
  isRunning,
}) => {
  const { t } = useTranslation();
  const modelProgress = totalSamples > 0 ? (sampleIndex / totalSamples) * 100 : 0;
  const overallProgress =
    totalModels > 0
      ? (((modelIndex - 1) * totalSamples + sampleIndex) / (totalModels * totalSamples)) * 100
      : 0;

  return (
    <Card className="bg-card border border-border space-y-4 p-5 rounded-lg shadow-none">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-border pb-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-md bg-muted/40 border border-border flex items-center justify-center text-muted-foreground">
            <Activity className="w-4 h-4 text-emerald-500" />
          </div>
          <div>
            <CardTitle className="font-semibold text-xs text-foreground flex items-center gap-2">
              <span>{t("live.title")}</span>
              <Badge variant="outline" className="text-[10px] font-mono border-border bg-muted/30 text-muted-foreground py-0">
                SSE LIVE
              </Badge>
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground font-mono mt-0.5">
              {t("live.modelCounter", { current: modelIndex, total: totalModels })}{" "}
              <strong className="text-foreground">
                {currentModel.split("/")[1] || currentModel}
              </strong>
            </CardDescription>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className={`text-xs font-mono font-medium px-2.5 py-0.5 border ${
              isRunning && sampleIndex === 0
                ? "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/40 animate-pulse"
                : "bg-muted/30 text-foreground border-border"
            }`}
          >
            {isRunning && sampleIndex === 0
              ? "Cargando modelo en VRAM..."
              : t("live.samplesCount", { current: sampleIndex, total: totalSamples })}
          </Badge>
        </div>
      </div>

      {/* Progress Bars */}
      <div className="space-y-3">
        <div className="space-y-1">
          <div className="flex justify-between text-xs font-mono">
            <span className="text-muted-foreground">
              {t("live.modelProgress", { model: currentModel.split("/")[1] || currentModel })}
            </span>
            <span className="font-semibold text-foreground">{modelProgress.toFixed(0)}%</span>
          </div>
          <Progress
            value={modelProgress}
            aria-label={t("live.modelProgress", { model: currentModel.split("/")[1] || currentModel })}
            className="h-1.5 bg-muted [&>div]:bg-foreground"
          />
        </div>

        <div className="space-y-1">
          <div className="flex justify-between text-xs font-mono">
            <span className="text-muted-foreground">{t("live.globalProgress")}</span>
            <span className="font-semibold text-foreground">{overallProgress.toFixed(0)}%</span>
          </div>
          <Progress
            value={overallProgress}
            aria-label={t("live.globalProgress")}
            className="h-1.5 bg-muted [&>div]:bg-foreground/70"
          />
        </div>
      </div>

      {/* Latest Sample Preview Stream Card */}
      {latestResult && (
        <div
          aria-live="polite"
          aria-atomic="true"
          className="bg-muted/15 border border-border rounded-md p-3.5 space-y-2.5 text-xs"
        >
          <div className="flex items-center justify-between border-b border-border/80 pb-2">
            <span className="text-muted-foreground font-medium flex items-center gap-1.5 font-mono text-xs">
              <Layers className="w-3.5 h-3.5 text-muted-foreground" />
              <span>{t("live.lastSampleProcessed", { id: latestResult.row_id })}</span>
            </span>
            <div className="flex items-center gap-3 font-mono text-[11px]">
              <span className="text-muted-foreground">
                {t("live.latency", { ms: latestResult.latency_ms?.toFixed(0) })}
              </span>
              <Badge
                variant="outline"
                className={`text-[10px] py-0 font-medium ${
                  latestResult.is_valid_json
                    ? "bg-muted/40 text-foreground border-border"
                    : "bg-destructive/10 text-destructive border-destructive/20"
                }`}
              >
                {latestResult.is_valid_json ? t("live.validJson") : t("live.formatError")}
              </Badge>
            </div>
          </div>

          {latestResult.parsed_json?.dimensions && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 font-mono">
              {Object.entries(latestResult.parsed_json.dimensions).map(([k, v]: [string, any]) => (
                <div
                  key={k}
                  className={`p-2 rounded-md border text-[11px] transition-all duration-150 ${
                    v?.active
                      ? "bg-muted/40 border-border text-foreground font-medium"
                      : "bg-transparent border-border/40 text-muted-foreground opacity-50"
                  }`}
                >
                  <span className="block truncate capitalize text-[10px] text-muted-foreground">{k.replace("_", " ")}</span>
                  <span className="font-semibold text-[11px]">
                    {v?.active ? t("live.activeWithPolarity", { polarity: v?.polarity || "neutro" }) : t("live.inactive")}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
};

