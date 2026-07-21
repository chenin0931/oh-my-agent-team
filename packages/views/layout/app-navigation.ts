import type { LucideIcon } from "lucide-react";
import {
  Activity,
  FolderKanban,
  Gauge,
  Inbox,
  ListTodo,
  Monitor,
  Network,
  Settings,
  Sparkles,
  UserRound,
  Users,
} from "lucide-react";
import type { WorkspacePaths } from "@ohmyagentteam/core/paths";

export type AppNavKey =
  | "inbox"
  | "myIssues"
  | "issues"
  | "projects"
  | "autopilots"
  | "agents"
  | "squads"
  | "runtimes"
  | "skills"
  | "usage"
  | "settings";

export type AppNavLabelKey =
  | "inbox"
  | "my_issues"
  | "issues"
  | "projects"
  | "autopilots"
  | "agents"
  | "squads"
  | "runtimes"
  | "skills"
  | "usage"
  | "settings";

export type AppSectionKey = "work" | "plan" | "network" | "capabilities" | "admin";

export interface AppNavItem {
  key: AppNavKey;
  labelKey: AppNavLabelKey;
  icon: LucideIcon;
}

export interface AppNavSection {
  key: AppSectionKey;
  icon: LucideIcon;
  items: AppNavItem[];
}

export const APP_NAV_SECTIONS: AppNavSection[] = [
  {
    key: "work",
    icon: Activity,
    items: [
      { key: "inbox", labelKey: "inbox", icon: Inbox },
      { key: "myIssues", labelKey: "my_issues", icon: UserRound },
      { key: "issues", labelKey: "issues", icon: ListTodo },
    ],
  },
  {
    key: "plan",
    icon: FolderKanban,
    items: [{ key: "projects", labelKey: "projects", icon: FolderKanban }],
  },
  {
    key: "network",
    icon: Network,
    items: [
      { key: "agents", labelKey: "agents", icon: Network },
      { key: "squads", labelKey: "squads", icon: Users },
    ],
  },
  {
    key: "capabilities",
    icon: Sparkles,
    items: [
      { key: "runtimes", labelKey: "runtimes", icon: Monitor },
      { key: "skills", labelKey: "skills", icon: Sparkles },
    ],
  },
  {
    key: "admin",
    icon: Gauge,
    items: [
      { key: "usage", labelKey: "usage", icon: Gauge },
      { key: "settings", labelKey: "settings", icon: Settings },
    ],
  },
];

export function resolveNavHref(paths: WorkspacePaths, key: AppNavKey): string {
  return paths[key]();
}

export function isNavActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function getActiveSection(pathname: string, paths: WorkspacePaths): AppNavSection {
  const explicit = APP_NAV_SECTIONS.find((section) =>
    section.items.some((item) => isNavActive(pathname, resolveNavHref(paths, item.key))),
  );
  if (explicit) return explicit;

  if (/\/epics(?:\/|$)/.test(pathname)) {
    return APP_NAV_SECTIONS.find((section) => section.key === "plan")!;
  }
  if (/\/(?:members)(?:\/|$)/.test(pathname)) {
    return APP_NAV_SECTIONS.find((section) => section.key === "network")!;
  }
  return APP_NAV_SECTIONS[0]!;
}
