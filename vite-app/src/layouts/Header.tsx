import {
  Sidebar as SidebarIcon,
  ChevronDown,
  CheckCircle,
  Presentation,
  GraduationCap,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { useEffect, useState } from "react"

interface HeaderProps {
  sidebarOpen: boolean
  setSidebarOpen: (open: boolean | ((prev: boolean) => boolean)) => void
  activeTab: "bank" | "ocr" | "student" | "gradebook" | "submissions"
  onRefresh: () => void
  isLoading: boolean
  role: "teacher" | "student"
  setRole: (role: "teacher" | "student") => void
  setActiveTab: (
    tab: "bank" | "ocr" | "student" | "gradebook" | "submissions"
  ) => void
}

export function Header({
  sidebarOpen,
  setSidebarOpen,
  activeTab,
  role,
  setRole,
  setActiveTab,
}: HeaderProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false)

  useEffect(() => {
    if (!dropdownOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDropdownOpen(false)
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [dropdownOpen])

  const tabTitles: Record<string, string> = {
    bank: "Catalog",
    ocr: "PDF OCR & Importer",
    student: "Online Examination Room",
    gradebook: "Gradebook & Analytics",
    submissions: "Student Results History",
  }

  const handlePortalSwitch = (newRole: "teacher" | "student") => {
    setRole(newRole)
    setActiveTab(newRole === "teacher" ? "bank" : "student")
    setDropdownOpen(false)
  }

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-background px-4 select-none">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setSidebarOpen((prev) => !prev)}
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
          aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
          aria-expanded={sidebarOpen}
          title={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
        >
          <SidebarIcon aria-hidden="true" className="h-4 w-4" />
        </Button>

        <div className="flex items-center gap-2 min-w-0">
          <h1 className="truncate text-sm font-medium text-foreground max-w-[140px] sm:max-w-none">
            {tabTitles[activeTab]}
          </h1>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {/* Portal Switcher Dropdown */}
        <div className="relative">
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            aria-haspopup="menu"
            aria-expanded={dropdownOpen}
            className="flex items-center justify-between gap-2 rounded-lg border border-border/80 bg-sidebar-accent/30 px-3 py-2 text-left transition-colors hover:bg-sidebar-accent/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring cursor-pointer"
          >
            {role === "teacher" ? (
              <Presentation aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
            ) : (
              <GraduationCap aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
            )}
            <span className="hidden text-xs font-semibold text-foreground sm:inline">
              {role === "teacher" ? "Teacher Portal" : "Student Portal"}
            </span>
            <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
          </button>

          {/* Dropdown panel */}
          {dropdownOpen && (
            <>
              <div
                aria-hidden="true"
                className="fixed inset-0 z-30"
                onClick={() => setDropdownOpen(false)}
              />
              <div
                role="menu"
                aria-label="Switch account portal"
                className="absolute top-full right-0 z-40 mt-2 w-56 animate-in space-y-1 rounded-lg border border-border bg-popover p-2 text-popover-foreground shadow-md duration-150 fade-in slide-in-from-top-1"
              >
                <p className="px-2 py-1 text-xs font-bold tracking-wider text-muted-foreground uppercase select-none">
                  Switch account portal
                </p>
                <button
                  role="menuitemradio"
                  aria-checked={role === "teacher"}
                  onClick={() => handlePortalSwitch("teacher")}
                  className={`flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-xs font-medium transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring ${
                    role === "teacher"
                      ? "bg-primary/5 font-semibold text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <Presentation aria-hidden="true" className="h-4 w-4 shrink-0" />
                    Teacher (Admin)
                  </span>
                  {role === "teacher" && (
                    <CheckCircle aria-hidden="true" className="h-4 w-4 shrink-0 text-primary" />
                  )}
                </button>
                <button
                  role="menuitemradio"
                  aria-checked={role === "student"}
                  onClick={() => handlePortalSwitch("student")}
                  className={`flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-xs font-medium transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring ${
                    role === "student"
                      ? "bg-primary/5 font-semibold text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <GraduationCap aria-hidden="true" className="h-4 w-4 shrink-0" />
                    Student Room
                  </span>
                  {role === "student" && (
                    <CheckCircle aria-hidden="true" className="h-4 w-4 shrink-0 text-primary" />
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
