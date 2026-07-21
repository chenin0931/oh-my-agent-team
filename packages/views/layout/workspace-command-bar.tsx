"use client";

import type { ReactNode } from "react";
import { Check, ChevronDown, LogOut, Plus } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@ohmyagentteam/ui/lib/utils";
import { BrandMark } from "@ohmyagentteam/ui/components/common/brand-mark";
import { SidebarTrigger } from "@ohmyagentteam/ui/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@ohmyagentteam/ui/components/ui/dropdown-menu";
import { useAuthStore } from "@ohmyagentteam/core/auth";
import { BRAND_NAME } from "@ohmyagentteam/core/brand";
import { openCreateIssueWithPreference } from "@ohmyagentteam/core/issues/stores/create-mode-store";
import { useModalStore } from "@ohmyagentteam/core/modals";
import { paths, useCurrentWorkspace, useWorkspacePaths } from "@ohmyagentteam/core/paths";
import { workspaceListOptions } from "@ohmyagentteam/core/workspace/queries";
import { AppLink, useNavigation } from "../navigation";
import { useLogout } from "../auth";
import { WorkspaceAvatar } from "../workspace/workspace-avatar";
import { useT } from "../i18n";
import {
  APP_NAV_SECTIONS,
  getActiveSection,
  isNavActive,
  resolveNavHref,
} from "./app-navigation";

interface WorkspaceCommandBarProps {
  searchSlot?: ReactNode;
}

export function WorkspaceCommandBar({ searchSlot }: WorkspaceCommandBarProps) {
  const { t } = useT("layout");
  const { pathname } = useNavigation();
  const workspacePaths = useWorkspacePaths();
  const workspace = useCurrentWorkspace();
  const user = useAuthStore((state) => state.user);
  const logout = useLogout();
  const { data: workspaces = [] } = useQuery(workspaceListOptions());
  const section = getActiveSection(pathname, workspacePaths);

  return (
    <header
      data-omat-command-bar
      className="relative z-20 flex shrink-0 flex-col border-b border-border/70 bg-background/95"
    >
      <div className="flex h-14 min-w-0 items-center gap-3 px-3 sm:h-16 sm:px-5">
        <SidebarTrigger className="shrink-0 md:hidden" />

        <AppLink
          href={workspacePaths.issues()}
          className="flex shrink-0 items-center gap-2.5 text-foreground"
          aria-label={BRAND_NAME}
        >
          <span className="flex size-8 items-center justify-center rounded-md bg-foreground text-background">
            <BrandMark monochrome className="size-5" />
          </span>
          <span className="hidden font-serif text-[17px] font-medium lg:inline">
            {BRAND_NAME}
          </span>
        </AppLink>

        <div className="hidden h-6 w-px bg-border/80 lg:block" />

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                className="hidden h-9 min-w-0 max-w-48 items-center gap-2 rounded-md px-2 text-sm transition-colors hover:bg-accent md:flex"
              />
            }
          >
            <WorkspaceAvatar
              name={workspace?.name ?? "O"}
              avatarUrl={workspace?.avatar_url}
              size="sm"
            />
            <span className="min-w-0 flex-1 truncate text-left font-medium">
              {workspace?.name ?? BRAND_NAME}
            </span>
            <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-72">
            <div className="px-2 py-2">
              <p className="truncate text-sm font-medium">{user?.name}</p>
              <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>{t(($) => $.sidebar.workspaces_label)}</DropdownMenuLabel>
            <DropdownMenuGroup>
              {workspaces.map((item) => (
                <DropdownMenuItem
                  key={item.id}
                  render={<AppLink href={paths.workspace(item.slug).issues()} />}
                >
                  <WorkspaceAvatar name={item.name} avatarUrl={item.avatar_url} size="sm" />
                  <span className="min-w-0 flex-1 truncate">{item.name}</span>
                  {item.id === workspace?.id ? <Check className="size-3.5" /> : null}
                </DropdownMenuItem>
              ))}
              <DropdownMenuItem onClick={() => useModalStore.getState().open("create-workspace")}>
                <Plus className="size-3.5" />
                {t(($) => $.sidebar.create_workspace)}
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={logout}>
              <LogOut className="size-3.5" />
              {t(($) => $.sidebar.log_out)}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <nav
          aria-label={t(($) => $.shell.primary_navigation)}
          className="mx-auto hidden min-w-0 items-center gap-1 md:flex"
        >
          {APP_NAV_SECTIONS.map((navSection) => {
            const href = resolveNavHref(workspacePaths, navSection.items[0]!.key);
            const active = navSection.key === section.key;
            return (
              <AppLink
                key={navSection.key}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex h-10 shrink-0 items-center gap-2 rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                  active && "bg-foreground text-background hover:bg-foreground hover:text-background",
                )}
              >
                <navSection.icon className="size-4" />
                <span className="hidden xl:inline">
                  {t(($) => $.shell.sections[navSection.key])}
                </span>
              </AppLink>
            );
          })}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-1.5 md:ml-0">
          {searchSlot}
          <button
            type="button"
            onClick={() => openCreateIssueWithPreference()}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-brand px-3 text-xs font-semibold text-brand-foreground transition-colors hover:bg-brand/90"
          >
            <Plus className="size-3.5" />
            <span className="hidden sm:inline">{t(($) => $.sidebar.new_issue)}</span>
            <kbd className="ml-1 hidden font-mono text-[9px] text-brand-foreground/65 2xl:inline">
              {t(($) => $.sidebar.new_issue_shortcut)}
            </kbd>
          </button>
        </div>
      </div>

      <div
        data-omat-context-bar
        className="flex h-10 min-w-0 items-center border-t border-border/60 px-3 sm:h-11 sm:px-5"
      >
        <div className="mr-3 hidden shrink-0 items-center gap-2 pr-3 text-xs font-semibold text-foreground sm:flex sm:border-r">
          <section.icon className="size-3.5 text-brand" />
          {t(($) => $.shell.sections[section.key])}
        </div>
        <nav
          aria-label={t(($) => $.shell.section_navigation)}
          className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto"
        >
          {section.items.map((item) => {
            const href = resolveNavHref(workspacePaths, item.key);
            const active = isNavActive(pathname, href);
            return (
              <AppLink
                key={item.key}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                  active && "bg-accent text-foreground",
                )}
              >
                <item.icon className="size-3.5" />
                {t(($) => $.nav[item.labelKey])}
              </AppLink>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
