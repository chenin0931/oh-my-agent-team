"use client";

import { DashboardLayout } from "@ohmyagentteam/views/layout";
import { OhMyAgentTeamIcon } from "@ohmyagentteam/ui/components/common/ohmyagentteam-icon";
import { SearchCommand, SearchTrigger } from "@ohmyagentteam/views/search";
import { ChatFab, ChatWindow } from "@ohmyagentteam/views/chat";
import { WebNotificationBridge } from "@/components/web-notification-bridge";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <DashboardLayout
      loadingIndicator={<OhMyAgentTeamIcon className="size-6" />}
      searchSlot={<SearchTrigger compact />}
      extra={
        <>
          <SearchCommand />
          <ChatWindow />
          <ChatFab />
          <WebNotificationBridge />
        </>
      }
    >
      {children}
    </DashboardLayout>
  );
}
