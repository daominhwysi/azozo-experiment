import { Sidebar as SidebarIcon, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface HeaderProps {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  activeTab: "bank" | "ocr" | "student";
  onRefresh: () => void;
  isLoading: boolean;
}

export function Header({
  sidebarOpen,
  setSidebarOpen,
  activeTab,
  onRefresh,
  isLoading,
}: HeaderProps) {
  const tabTitles: Record<string, string> = {
    bank: "Ngân Hàng Đề Thi Notion",
    ocr: "Công Cụ OCR & Bóc Tách Đề Thi",
    student: "Phòng Thi Trực Tuyến Học Sinh",
  };

  return (
    <header className="h-14 border-b border-border bg-background px-4 flex items-center justify-between sticky top-0 z-30 select-none">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setSidebarOpen((prev) => !prev)}
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
          title={sidebarOpen ? "Thu gọn thanh bên" : "Mở thanh bên"}
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

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onRefresh}
          disabled={isLoading}
          className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
          Đồng bộ Backend
        </Button>
      </div>
    </header>
  );
}
