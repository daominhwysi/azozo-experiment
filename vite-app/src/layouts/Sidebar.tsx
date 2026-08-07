import { useEffect, useRef, useState } from "react"
import {
  FileCode,
  UploadCloud,
  Play,
  GraduationCap,
  ClipboardCheck,
  Library,
  TrendingUp,
  Activity,
  Settings,
  Check,
  X,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { useTheme } from "@/components/theme-provider"
import { cn } from "@/lib/utils"

interface SidebarProps {
  activeTab: "bank" | "ocr" | "student" | "gradebook" | "submissions"
  setActiveTab: (
    tab: "bank" | "ocr" | "student" | "gradebook" | "submissions"
  ) => void
  examCount: number
  role: "teacher" | "student"
  choiceStyle: "radio" | "abcd"
  setChoiceStyle: (style: "radio" | "abcd") => void
  serverStatus: "connecting" | "online" | "offline"
  /** Below the md breakpoint the sidebar becomes an overlay drawer. */
  isMobile: boolean
  onClose: () => void
}

interface NavItem {
  id: "bank" | "ocr" | "student" | "gradebook" | "submissions"
  label: string
  icon: React.ComponentType<{ className?: string }>
  badge?: string | null
}

interface NavGroup {
  groupName: string
  icon: React.ComponentType<{ className?: string }>
  items: NavItem[]
}

export function Sidebar({
  activeTab,
  setActiveTab,
  examCount,
  role,
  choiceStyle,
  setChoiceStyle,
  serverStatus,
  isMobile,
  onClose,
}: SidebarProps) {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const { theme, setTheme } = useTheme()
  const panelRef = useRef<HTMLElement>(null)

  // As a drawer the sidebar is modal-ish: Escape closes it and focus starts inside.
  useEffect(() => {
    if (!isMobile) return
    panelRef.current?.focus()
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [isMobile, onClose])

  useEffect(() => {
    if (!settingsOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSettingsOpen(false)
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [settingsOpen])

  // Grouped Navigation Items matching Notion category layouts
  const navigationGroups: NavGroup[] =
    role === "teacher"
      ? [
          {
            groupName: "Assessment Library",
            icon: Library,
            items: [
              {
                id: "bank",
                label: "Exam Catalog",
                icon: FileCode,
                badge: examCount > 0 ? examCount.toString() : null,
              },
              {
                id: "ocr",
                label: "PDF OCR & Import",
                icon: UploadCloud,
              },
            ],
          },
          {
            groupName: "Analytics & Tracking",
            icon: TrendingUp,
            items: [
              {
                id: "gradebook",
                label: "Gradebook Ledger",
                icon: GraduationCap,
              },
            ],
          },
        ]
      : [
          {
            groupName: "Student Portal",
            icon: Activity,
            items: [
              {
                id: "student",
                label: "Online Exam Room",
                icon: Play,
                badge: "Live",
              },
              {
                id: "submissions",
                label: "My Results History",
                icon: ClipboardCheck,
              },
            ],
          },
        ]

  return (
    <>
      {/* Scrim — only exists while the sidebar is a drawer. */}
      {isMobile && (
        <div
          aria-hidden="true"
          onClick={onClose}
          className="fixed inset-0 z-40 bg-black/20"
        />
      )}

      <aside
        ref={panelRef}
        tabIndex={isMobile ? -1 : undefined}
        role={isMobile ? "dialog" : undefined}
        aria-modal={isMobile ? "true" : undefined}
        aria-label={isMobile ? "Navigation" : undefined}
        className={cn(
          "flex flex-col justify-between border-r border-border bg-sidebar p-4 select-none outline-none",
          isMobile
            ? "fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw]"
            : "sticky top-0 z-20 h-screen w-64 shrink-0"
        )}
      >
      <div className="flex flex-col min-h-0 flex-1 justify-between">
        <div className="space-y-4 min-h-0 flex-1 overflow-y-auto">
          {/* Brand Logo */}
          <div className="flex items-center gap-2 px-2 py-1 select-none">
            <span className="text-xl font-black tracking-tighter text-primary">
              AZOZO
            </span>
            <span className="rounded border border-border/60 bg-muted/40 px-2 py-1 font-mono text-xs font-bold tracking-widest text-muted-foreground uppercase">
              Workspace
            </span>
            {isMobile && (
              <button
                onClick={onClose}
                aria-label="Close navigation"
                className="ml-auto rounded p-1 text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <X aria-hidden="true" className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Grouped collapsibles navigation list */}
          <nav aria-label="Workspace" className="space-y-4 pt-1">
            {navigationGroups.map((group, gIdx) => {
              const GroupIcon = group.icon
              const groupLabelId = `sidebar-group-${gIdx}`
              return (
                <div key={gIdx} className="space-y-1">
                  <p
                    id={groupLabelId}
                    className="flex items-center gap-2 px-2 text-xs font-bold tracking-wider text-muted-foreground uppercase"
                  >
                    <GroupIcon aria-hidden="true" className="h-3 w-3 opacity-60" />
                    {group.groupName}
                  </p>

                  <ul aria-labelledby={groupLabelId} className="space-y-1">
                    {group.items.map((item) => {
                      const Icon = item.icon
                      const isActive = activeTab === item.id
                      return (
                        <li key={item.id}>
                        <button
                          onClick={() => setActiveTab(item.id)}
                          aria-current={isActive ? "page" : undefined}
                          className={`flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring ${
                            isActive
                              ? "bg-sidebar-accent font-semibold text-sidebar-accent-foreground"
                              : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground"
                          }`}
                        >
                          <div className="flex min-w-0 flex-1 items-center gap-2">
                            <Icon
                              aria-hidden="true"
                              className={`h-4 w-4 shrink-0 ${isActive ? "text-primary" : "text-muted-foreground"}`}
                            />
                            <span className="min-w-0 flex-1 truncate text-left">
                              {item.label}
                            </span>
                          </div>
                          {item.badge && (
                            <Badge
                              variant={isActive ? "default" : "secondary"}
                              className="flex h-5 shrink-0 items-center justify-center px-2 py-0 text-xs font-medium whitespace-nowrap"
                            >
                              {item.badge}
                            </Badge>
                          )}
                        </button>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )
            })}
          </nav>
        </div>

        {/* Settings button */}
        <div className="relative pt-2 pb-1 border-t border-border/60 shrink-0">
          <button
            onClick={() => setSettingsOpen(!settingsOpen)}
            aria-haspopup="dialog"
            aria-expanded={settingsOpen}
            className={cn(
              "flex w-full items-center gap-2 rounded-md px-3 py-2 text-xs font-medium transition-colors text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring",
              settingsOpen && "bg-sidebar-accent/50 text-foreground"
            )}
          >
            <Settings aria-hidden="true" className="h-4 w-4 shrink-0" />
            <span>Settings</span>
          </button>

          {settingsOpen && (
            <>
              <div
                aria-hidden="true"
                className="fixed inset-0 z-40"
                onClick={() => setSettingsOpen(false)}
              />
              <div
                role="dialog"
                aria-label="Settings"
                className="absolute bottom-full left-0 z-50 mb-2 w-56 animate-in space-y-2 rounded-lg border border-border bg-popover p-2 text-popover-foreground shadow-md duration-150 fade-in slide-in-from-bottom-1"
              >
                <p className="px-2 py-1 text-xs font-bold tracking-wider text-muted-foreground uppercase select-none">
                  Interface theme
                </p>
                <div className="grid grid-cols-3 gap-1">
                  {(["light", "dark", "system"] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setTheme(t)}
                      aria-pressed={theme === t}
                      className={cn(
                        "rounded border px-2 py-1 text-center text-xs font-medium capitalize transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                        theme === t
                          ? "border-primary/20 bg-primary/5 font-semibold text-primary"
                          : "border-transparent bg-transparent hover:bg-muted text-muted-foreground"
                      )}
                    >
                      {t}
                    </button>
                  ))}
                </div>

                <div className="border-t border-border/40" />

                <p className="px-2 py-1 text-xs font-bold tracking-wider text-muted-foreground uppercase select-none">
                  Option choice style
                </p>
                <button
                  onClick={() => {
                    setChoiceStyle("radio")
                    setSettingsOpen(false)
                  }}
                  className={cn(
                    "flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-xs font-medium transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring",
                    choiceStyle === "radio"
                      ? "bg-primary/5 font-semibold text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <span>Standard Radio</span>
                  {choiceStyle === "radio" && (
                    <Check className="h-3.5 w-3.5 text-primary" />
                  )}
                </button>
                <button
                  onClick={() => {
                    setChoiceStyle("abcd")
                    setSettingsOpen(false)
                  }}
                  className={cn(
                    "flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-xs font-medium transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring",
                    choiceStyle === "abcd"
                      ? "bg-primary/5 font-semibold text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <span>ABCD Letters</span>
                  {choiceStyle === "abcd" && (
                    <Check className="h-3.5 w-3.5 text-primary" />
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Footer Info */}
      <div className="border-t border-border/60 px-2 pt-4 shrink-0">
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-2" role="status" aria-live="polite">
            <div
              aria-hidden="true"
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                serverStatus === "online"
                  ? "bg-success"
                  : serverStatus === "offline"
                    ? "bg-destructive"
                    : "animate-pulse bg-muted-foreground"
              )}
            />
            <span>
              {serverStatus === "online"
                ? "Server connected"
                : serverStatus === "offline"
                  ? "Server unreachable"
                  : "Connecting…"}
            </span>
          </div>
          <span className="text-xs opacity-40">v1.2.0</span>
        </div>
      </div>
      </aside>
    </>
  )
}
