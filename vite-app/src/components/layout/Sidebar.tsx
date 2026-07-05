import { FileCode, UploadCloud, Play } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface SidebarProps {
  activeTab: "bank" | "ocr" | "student";
  setActiveTab: (tab: "bank" | "ocr" | "student") => void;
  examCount: number;
}

export function Sidebar({ activeTab, setActiveTab, examCount }: SidebarProps) {
  const menuItems = [
    {
      id: "bank" as const,
      label: "Exam Bank",
      icon: FileCode,
      badge: examCount > 0 ? examCount.toString() : null,
    },
    {
      id: "ocr" as const,
      label: "Process PDF",
      icon: UploadCloud,
    },
    {
      id: "student" as const,
      label: "Exam Room",
      icon: Play,
      badge: "Live",
    },
  ];

  return (
    <aside className="sticky top-0 h-screen w-[270px] border-r border-border bg-sidebar flex flex-col justify-between p-3 select-none shrink-0 overflow-y-auto z-20">
      <div className="space-y-4">
        {/* Workspace Title */}
        <div className="px-2 py-1.5 flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">
            AZ
          </div>
          <div>
            <h2 className="text-xs font-semibold text-foreground tracking-tight">
              Azozo Exam Space
            </h2>
            <p className="text-[10px] text-muted-foreground">Notion UI System v1.0</p>
          </div>
        </div>

        {/* Navigation Section */}
        <div className="space-y-1">
          <p className="px-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
            Danh Mục Chính
          </p>

          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-md text-xs font-medium transition-colors ${isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground font-semibold"
                  : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground"
                  }`}
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <Icon className={`h-4 w-4 shrink-0 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
                  <span className="whitespace-nowrap text-left">{item.label}</span>
                </div>
                {item.badge && (
                  <Badge
                    variant={isActive ? "default" : "secondary"}
                    className="text-[10px] px-1.5 py-0.5 h-5 shrink-0 whitespace-nowrap flex items-center justify-center font-medium"
                  >
                    {item.badge}
                  </Badge>
                )}
              </button>
            );
          })}
        </div>
      </div>


      {/* Footer Info */}

    </aside>
  );
}
