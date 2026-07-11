import { Sidebar as SidebarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

interface HeaderProps {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  activeTab: "bank" | "ocr" | "student" | "gradebook" | "submissions";
  onRefresh: () => void;
  isLoading: boolean;
}

export function Header({
  sidebarOpen,
  setSidebarOpen,
  activeTab,
}: HeaderProps) {
  const tabTitles: Record<string, string> = {
    bank: "Notion Exam Bank",
    ocr: "PDF OCR & Importer",
    student: "Online Examination Room",
    gradebook: "Gradebook & Analytics",
    submissions: "Student Results History",
  };

  return (
    <header className="h-14 border-b border-border bg-background px-4 flex items-center justify-between sticky top-0 z-30 select-none">
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
        
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold tracking-tight text-foreground">
            Azozo
          </span>
          <span className="text-muted-foreground font-light">/</span>
          <span className="text-sm font-medium text-foreground">
            {tabTitles[activeTab]}
          </span>
        </div>
      </div>
    </header>
  );
}
