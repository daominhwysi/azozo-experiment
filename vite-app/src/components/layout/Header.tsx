import { Sidebar as SidebarIcon, ChevronDown, CheckCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useState } from "react"

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
          title={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
        >
          <SidebarIcon className="h-4 w-4" />
        </Button>

        <div className="flex items-center gap-2 min-w-0">
          <span className="truncate text-sm font-medium text-foreground max-w-[140px] sm:max-w-none">
            {tabTitles[activeTab]}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {/* Portal Switcher Dropdown */}
        <div className="relative">
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="flex items-center justify-between gap-2 rounded-lg border border-border/80 bg-sidebar-accent/30 px-2.5 py-1.5 text-left transition-all hover:bg-sidebar-accent/60 focus:outline-none cursor-pointer"
          >
            <span className="text-xs font-semibold text-foreground">
              {role === "teacher" ? "🍎 Teacher Portal" : "🎓 Student Portal"}
            </span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          </button>

          {/* Dropdown panel */}
          {dropdownOpen && (
            <>
              <div
                className="fixed inset-0 z-30"
                onClick={() => setDropdownOpen(false)}
              />
              <div className="absolute top-[108%] right-0 z-40 w-48 animate-in space-y-0.5 rounded-lg border border-border bg-popover p-1.5 text-popover-foreground shadow-md duration-150 fade-in slide-in-from-top-1">
                <p className="px-2 py-1 text-[8px] font-bold tracking-wider text-muted-foreground uppercase select-none">
                  Switch Account Portal
                </p>
                <button
                  onClick={() => handlePortalSwitch("teacher")}
                  className={`flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-xs font-medium transition-colors cursor-pointer ${
                    role === "teacher"
                      ? "bg-primary/5 font-semibold text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    🍎 Teacher (Admin)
                  </span>
                  {role === "teacher" && (
                    <CheckCircle className="h-3 w-3 shrink-0 text-primary" />
                  )}
                </button>
                <button
                  onClick={() => handlePortalSwitch("student")}
                  className={`flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-xs font-medium transition-colors cursor-pointer ${
                    role === "student"
                      ? "bg-primary/5 font-semibold text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    🎓 Student Room
                  </span>
                  {role === "student" && (
                    <CheckCircle className="h-3 w-3 shrink-0 text-primary" />
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
