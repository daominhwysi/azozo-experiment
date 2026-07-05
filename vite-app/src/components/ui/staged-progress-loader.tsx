import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, Circle, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ProgressStage {
  id: string;
  label: string;
  description?: string;
}

export interface StagedProgressLoaderProps {
  title?: string;
  subtitle?: string;
  stages: ProgressStage[];
  currentStageIndex: number;
  progress: number; // 0 to 100
  statusText?: string;
  error?: string | null;
  className?: string;
  showTimer?: boolean;
}

export function StagedProgressLoader({
  title = "Đang xử lý dữ liệu...",
  subtitle,
  stages,
  currentStageIndex,
  progress,
  statusText,
  error,
  className,
  showTimer = true,
}: StagedProgressLoaderProps) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (progress >= 100 || error) return;
    const interval = setInterval(() => {
      setElapsed((prev) => +(prev + 0.1).toFixed(1));
    }, 100);
    return () => clearInterval(interval);
  }, [progress, error]);

  const clampedProgress = Math.min(100, Math.max(0, progress));

  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card/95 p-5 shadow-sm backdrop-blur transition-all space-y-4",
        className
      )}
    >
      {/* Header Info */}
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-0.5">
          <h3 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
            {error ? (
              <AlertCircle className="h-4 w-4 text-destructive animate-pulse" />
            ) : progress < 100 ? (
              <Loader2 className="h-4 w-4 text-primary animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            )}
            {title}
          </h3>
          {subtitle && (
            <p className="text-[11px] text-muted-foreground">{subtitle}</p>
          )}
        </div>

        {/* Percentage Badge & Timer */}
        <div className="flex items-center gap-2 font-mono text-xs font-semibold">
          {showTimer && (
            <span className="text-[11px] text-muted-foreground bg-muted/60 px-2 py-0.5 rounded-md border border-border/50">
              {elapsed.toFixed(1)}s
            </span>
          )}
          <span
            className={cn(
              "px-2.5 py-0.5 rounded-md text-xs tabular-nums transition-colors",
              error
                ? "bg-destructive/10 text-destructive border border-destructive/20"
                : progress === 100
                ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 dark:text-emerald-400"
                : "bg-primary/10 text-primary border border-primary/20"
            )}
          >
            {Math.round(clampedProgress)}%
          </span>
        </div>
      </div>

      {/* Progress Track Bar */}
      <div className="space-y-1.5">
        <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted/70">
          <div
            className={cn(
              "h-full transition-all duration-300 ease-out rounded-full relative",
              error
                ? "bg-destructive"
                : progress === 100
                ? "bg-emerald-500"
                : "bg-gradient-to-r from-blue-600 via-indigo-500 to-purple-600"
            )}
            style={{ width: `${clampedProgress}%` }}
          >
            {/* Shimmer overlay particle */}
            {progress > 0 && progress < 100 && !error && (
              <div className="absolute inset-0 bg-[linear-gradient(90deg,transparent_0%,rgba(255,255,255,0.4)_50%,transparent_100%)] animate-[shimmer_1.5s_infinite]" />
            )}
          </div>
        </div>

        {/* Current status detail text */}
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-muted-foreground italic truncate max-w-[80%]">
            {error || statusText || "Đang thực hiện công việc..."}
          </span>
          <span className="text-muted-foreground/70 font-mono text-[10px]">
            Bước {Math.min(stages.length, currentStageIndex + 1)}/{stages.length}
          </span>
        </div>
      </div>

      {/* Stages Checklist */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 border-t border-border/50">
        {stages.map((stage, idx) => {
          const isDone = idx < currentStageIndex || progress === 100;
          const isCurrent = idx === currentStageIndex && progress < 100 && !error;

          return (
            <div
              key={stage.id || idx}
              className={cn(
                "flex items-start gap-2.5 p-2 rounded-lg text-xs transition-all border",
                isDone
                  ? "bg-emerald-500/5 border-emerald-500/20 text-foreground"
                  : isCurrent
                  ? "bg-primary/5 border-primary/30 text-foreground shadow-xs"
                  : "bg-muted/30 border-transparent text-muted-foreground/60"
              )}
            >
              <div className="mt-0.5 shrink-0">
                {isDone ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                ) : isCurrent ? (
                  <Loader2 className="h-3.5 w-3.5 text-primary animate-spin" />
                ) : (
                  <Circle className="h-3.5 w-3.5 opacity-40" />
                )}
              </div>
              <div className="min-w-0 space-y-0.5">
                <p
                  className={cn(
                    "font-medium leading-none truncate text-[11px]",
                    isCurrent && "font-semibold text-primary"
                  )}
                >
                  {stage.label}
                </p>
                {stage.description && (
                  <p className="text-[10px] text-muted-foreground truncate">
                    {stage.description}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
