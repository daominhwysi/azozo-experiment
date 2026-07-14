import { useEffect, useState } from "react"
import { CheckCircle2, Loader2, Circle, AlertCircle } from "lucide-react"
import { cn } from "@/lib/utils"

export interface ProgressStage {
  id: string
  label: string
  description?: string
}

export interface StagedProgressLoaderProps {
  title?: string
  subtitle?: string
  stages: ProgressStage[]
  currentStageIndex: number
  progress: number // 0 to 100
  statusText?: string
  error?: string | null
  className?: string
  showTimer?: boolean
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
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    if (progress >= 100 || error) return
    const interval = setInterval(() => {
      setElapsed((prev) => +(prev + 0.1).toFixed(1))
    }, 100)
    return () => clearInterval(interval)
  }, [progress, error])

  const clampedProgress = Math.min(100, Math.max(0, progress))

  return (
    <div
      className={cn(
        "space-y-4 rounded-xl border border-border bg-card/95 p-5 shadow-sm backdrop-blur transition-all",
        className
      )}
    >
      {/* Header Info */}
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-0.5">
          <h3 className="flex items-center gap-2 text-xs font-bold tracking-wider text-foreground uppercase">
            {error ? (
              <AlertCircle className="h-4 w-4 animate-pulse text-destructive" />
            ) : progress < 100 ? (
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
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
            <span className="rounded-md border border-border/50 bg-muted/60 px-2 py-0.5 text-[11px] text-muted-foreground">
              {elapsed.toFixed(1)}s
            </span>
          )}
          <span
            className={cn(
              "rounded-md px-2.5 py-0.5 text-xs tabular-nums transition-colors",
              error
                ? "border border-destructive/20 bg-destructive/10 text-destructive"
                : progress === 100
                  ? "border border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                  : "border border-primary/20 bg-primary/10 text-primary"
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
              "relative h-full rounded-full transition-all duration-300 ease-out",
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
              <div className="absolute inset-0 animate-[shimmer_1.5s_infinite] bg-[linear-gradient(90deg,transparent_0%,rgba(255,255,255,0.4)_50%,transparent_100%)]" />
            )}
          </div>
        </div>

        {/* Current status detail text */}
        <div className="flex items-center justify-between text-[11px]">
          <span className="max-w-[80%] truncate text-muted-foreground italic">
            {error || statusText || "Đang thực hiện công việc..."}
          </span>
          <span className="font-mono text-[10px] text-muted-foreground/70">
            Bước {Math.min(stages.length, currentStageIndex + 1)}/
            {stages.length}
          </span>
        </div>
      </div>

      {/* Stages Checklist */}
      <div className="grid grid-cols-1 gap-2 border-t border-border/50 pt-1 sm:grid-cols-2">
        {stages.map((stage, idx) => {
          const isDone = idx < currentStageIndex || progress === 100
          const isCurrent =
            idx === currentStageIndex && progress < 100 && !error

          return (
            <div
              key={stage.id || idx}
              className={cn(
                "flex items-start gap-2.5 rounded-lg border p-2 text-xs transition-all",
                isDone
                  ? "border-emerald-500/20 bg-emerald-500/5 text-foreground"
                  : isCurrent
                    ? "border-primary/30 bg-primary/5 text-foreground shadow-xs"
                    : "border-transparent bg-muted/30 text-muted-foreground/60"
              )}
            >
              <div className="mt-0.5 shrink-0">
                {isDone ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                ) : isCurrent ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                ) : (
                  <Circle className="h-3.5 w-3.5 opacity-40" />
                )}
              </div>
              <div className="min-w-0 space-y-0.5">
                <p
                  className={cn(
                    "truncate text-[11px] leading-none font-medium",
                    isCurrent && "font-semibold text-primary"
                  )}
                >
                  {stage.label}
                </p>
                {stage.description && (
                  <p className="truncate text-[10px] text-muted-foreground">
                    {stage.description}
                  </p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
