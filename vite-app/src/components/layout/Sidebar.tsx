import { useState } from "react"
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
}: SidebarProps) {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const { theme, setTheme } = useTheme()

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
    <aside className="sticky top-0 z-20 flex h-screen w-[260px] shrink-0 flex-col justify-between border-r border-border bg-sidebar p-3.5 select-none">
      <div className="flex flex-col min-h-0 flex-1 justify-between">
        <div className="space-y-4 min-h-0 flex-1 overflow-y-auto">
          {/* Brand Logo */}
          <div className="flex items-center gap-2 px-2.5 py-1 select-none">
            <span className="text-xl font-black tracking-tighter text-primary">
              AZOZO
            </span>
            <span className="rounded border border-border/60 bg-muted/40 px-1.5 py-0.5 font-mono text-[9px] font-bold tracking-widest text-muted-foreground uppercase">
              Workspace
            </span>
          </div>

          {/* Grouped collapsibles navigation list */}
          <div className="space-y-4 pt-1">
            {navigationGroups.map((group, gIdx) => {
              const GroupIcon = group.icon
              return (
                <div key={gIdx} className="space-y-1">
                  <p className="flex items-center gap-1.5 px-2 text-[9px] font-bold tracking-wider text-muted-foreground uppercase">
                    <GroupIcon className="h-3 w-3 opacity-60" />
                    {group.groupName}
                  </p>

                  <div className="space-y-0.5">
                    {group.items.map((item) => {
                      const Icon = item.icon
                      const isActive = activeTab === item.id
                      return (
                        <button
                          key={item.id}
                          onClick={() => setActiveTab(item.id)}
                          className={`flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-2 text-xs font-medium transition-colors ${
                            isActive
                              ? "bg-sidebar-accent font-semibold text-sidebar-accent-foreground"
                              : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground"
                          }`}
                        >
                          <div className="flex min-w-0 flex-1 items-center gap-2">
                            <Icon
                              className={`h-4 w-4 shrink-0 ${isActive ? "text-primary" : "text-muted-foreground"}`}
                            />
                            <span className="text-left whitespace-nowrap">
                              {item.label}
                            </span>
                          </div>
                          {item.badge && (
                            <Badge
                              variant={isActive ? "default" : "secondary"}
                              className="flex h-4.5 shrink-0 items-center justify-center px-1.5 py-0.5 text-[9px] font-medium whitespace-nowrap"
                            >
                              {item.badge}
                            </Badge>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Settings button */}
        <div className="relative pt-2 pb-1 border-t border-border/60 shrink-0">
          <button
            onClick={() => setSettingsOpen(!settingsOpen)}
            className={cn(
              "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-xs font-medium transition-colors text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground cursor-pointer",
              settingsOpen && "bg-sidebar-accent/50 text-foreground"
            )}
          >
            <Settings className="h-4 w-4 shrink-0" />
            <span>Settings</span>
          </button>

          {settingsOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setSettingsOpen(false)}
              />
              <div className="absolute bottom-[108%] left-0 z-50 w-52 animate-in space-y-1.5 rounded-lg border border-border bg-popover p-1.5 text-popover-foreground shadow-md duration-150 fade-in slide-in-from-bottom-1">
                <p className="px-2 py-1 text-[8px] font-bold tracking-wider text-muted-foreground uppercase select-none">
                  Interface Theme
                </p>
                <div className="grid grid-cols-3 gap-1 px-1">
                  {(["light", "dark", "system"] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setTheme(t)}
                      className={cn(
                        "rounded px-1.5 py-1 text-[10px] font-medium capitalize transition-colors cursor-pointer border text-center",
                        theme === t
                          ? "border-primary/20 bg-primary/5 font-semibold text-primary"
                          : "border-transparent bg-transparent hover:bg-muted text-muted-foreground"
                      )}
                    >
                      {t}
                    </button>
                  ))}
                </div>

                <div className="border-t border-border/40 my-1" />

                <p className="px-2 py-0.5 text-[8px] font-bold tracking-wider text-muted-foreground uppercase select-none">
                  Option Choice Style
                </p>
                <button
                  onClick={() => {
                    setChoiceStyle("radio")
                    setSettingsOpen(false)
                  }}
                  className={cn(
                    "flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-xs font-medium transition-colors cursor-pointer",
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
                    "flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-xs font-medium transition-colors cursor-pointer",
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
      <div className="border-t border-border/60 px-2 pt-3 shrink-0">
        <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-500"></div>
            <span>Server connected</span>
          </div>
          <span className="text-[9px] opacity-40">v1.2.0</span>
        </div>
      </div>
    </aside>
  )
}
