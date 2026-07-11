import { useState } from "react";
import { 
  FileCode, 
  UploadCloud, 
  Play, 
  GraduationCap, 
  ClipboardCheck, 
  ChevronDown, 
  Library, 
  TrendingUp, 
  Activity, 
  CheckCircle
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface SidebarProps {
  activeTab: "bank" | "ocr" | "student" | "gradebook" | "submissions";
  setActiveTab: (tab: "bank" | "ocr" | "student" | "gradebook" | "submissions") => void;
  examCount: number;
  role: "teacher" | "student";
  setRole: (role: "teacher" | "student") => void;
}

interface NavItem {
  id: "bank" | "ocr" | "student" | "gradebook" | "submissions";
  label: string;
  icon: React.ComponentType<any>;
  badge?: string | null;
}

interface NavGroup {
  groupName: string;
  icon: React.ComponentType<any>;
  items: NavItem[];
}

export function Sidebar({ activeTab, setActiveTab, examCount, role, setRole }: SidebarProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const handlePortalSwitch = (newRole: "teacher" | "student") => {
    setRole(newRole);
    setActiveTab(newRole === "teacher" ? "bank" : "student");
    setDropdownOpen(false);
  };

  // Grouped Navigation Items matching Notion category layouts
  const navigationGroups: NavGroup[] = role === "teacher"
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
          ]
        },
        {
          groupName: "Analytics & Tracking",
          icon: TrendingUp,
          items: [
            {
              id: "gradebook",
              label: "Gradebook Ledger",
              icon: GraduationCap,
            }
          ]
        }
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
            }
          ]
        }
      ];

  return (
    <aside className="sticky top-0 h-screen w-[260px] border-r border-border bg-sidebar flex flex-col justify-between p-3.5 select-none shrink-0 overflow-y-auto z-20">
      <div className="space-y-5">
        {/* Workspace Dropdown Switcher (Notion account style) */}
        <div className="relative">
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="w-full flex items-center justify-between gap-2.5 p-2 rounded-lg border border-border/80 bg-sidebar-accent/30 hover:bg-sidebar-accent/60 transition-all text-left focus:outline-none"
          >
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center text-primary font-bold text-xs shrink-0 shadow-xs">
                AZ
              </div>
              <div className="min-w-0">
                <h3 className="text-[11px] font-bold text-foreground truncate leading-tight">Azozo Workspace</h3>
                <span className="text-[9px] text-muted-foreground font-medium flex items-center gap-1 mt-0.5">
                  {role === "teacher" ? "🍎 Teacher Portal" : "🎓 Student Portal"}
                </span>
              </div>
            </div>
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          </button>

          {/* Premium dropdown panel */}
          {dropdownOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setDropdownOpen(false)} />
              <div className="absolute top-[108%] left-0 w-full bg-popover text-popover-foreground border border-border rounded-lg shadow-md p-1.5 z-40 space-y-0.5 animate-in fade-in slide-in-from-top-1 duration-150">
                <p className="text-[8px] font-bold text-muted-foreground uppercase tracking-wider px-2 py-1 select-none">
                  Switch Account Portal
                </p>
                <button
                  onClick={() => handlePortalSwitch("teacher")}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs font-medium text-left transition-colors ${
                    role === "teacher" 
                      ? "bg-primary/5 text-primary font-semibold" 
                      : "hover:bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <span className="flex items-center gap-1.5">🍎 Teacher (Admin)</span>
                  {role === "teacher" && <CheckCircle className="h-3 w-3 text-primary shrink-0" />}
                </button>
                <button
                  onClick={() => handlePortalSwitch("student")}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs font-medium text-left transition-colors ${
                    role === "student" 
                      ? "bg-primary/5 text-primary font-semibold" 
                      : "hover:bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <span className="flex items-center gap-1.5">🎓 Student Room</span>
                  {role === "student" && <CheckCircle className="h-3 w-3 text-primary shrink-0" />}
                </button>
              </div>
            </>
          )}
        </div>

        {/* Grouped collapsibles navigation list */}
        <div className="space-y-4 pt-1">
          {navigationGroups.map((group, gIdx) => {
            const GroupIcon = group.icon;
            return (
              <div key={gIdx} className="space-y-1">
                <p className="px-2 text-[9px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <GroupIcon className="h-3 w-3 opacity-60" />
                  {group.groupName}
                </p>

                <div className="space-y-0.5">
                  {group.items.map((item) => {
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
                            className="text-[9px] px-1.5 py-0.5 h-4.5 shrink-0 whitespace-nowrap flex items-center justify-center font-medium"
                          >
                            {item.badge}
                          </Badge>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer Info */}
      <div className="border-t border-border/60 pt-3 px-2">
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground justify-between">
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></div>
            <span>Server connected</span>
          </div>
          <span className="text-[9px] opacity-40">v1.2.0</span>
        </div>
      </div>
    </aside>
  );
}
