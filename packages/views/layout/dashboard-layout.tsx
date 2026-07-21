"use client";

import type { ReactNode } from "react";
import { SidebarProvider, SidebarInset } from "@ohmyagentteam/ui/components/ui/sidebar";
import { ModalRegistry } from "../modals/registry";
import { AppSidebar } from "./app-sidebar";
import { DashboardGuard } from "./dashboard-guard";
import { NavigationProgress } from "./navigation-progress";
import { WorkspacePresencePrefetch } from "./workspace-presence-prefetch";
import { WorkspaceCommandBar } from "./workspace-command-bar";

interface DashboardLayoutProps {
  children: ReactNode;
  /** Rendered inside SidebarInset (e.g. ChatWindow, ChatFab — absolute-positioned overlays) */
  extra?: ReactNode;
  /** Rendered inside sidebar header as a search trigger */
  searchSlot?: ReactNode;
  /** Loading indicator */
  loadingIndicator?: ReactNode;
}

export function DashboardLayout({
  children,
  extra,
  searchSlot,
  loadingIndicator,
}: DashboardLayoutProps) {
  return (
    <DashboardGuard
      loadingFallback={
        <div className="flex h-svh items-center justify-center">
          {loadingIndicator}
        </div>
      }
    >
      <SidebarProvider
        defaultOpen={false}
        open={false}
        defaultWidth={320}
        className="h-svh bg-[var(--shell-background)]"
      >
        <WorkspacePresencePrefetch />
        <AppSidebar />
        <SidebarInset className="relative m-0 min-w-0 overflow-hidden rounded-none bg-[var(--shell-background)] md:m-0 md:rounded-none">
          <NavigationProgress />
          <WorkspaceCommandBar searchSlot={searchSlot} />
          <div data-omat-page-canvas className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {children}
          </div>
          <ModalRegistry />
          {extra}
        </SidebarInset>
      </SidebarProvider>
    </DashboardGuard>
  );
}
