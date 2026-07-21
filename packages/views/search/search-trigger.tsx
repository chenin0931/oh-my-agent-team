"use client";

import { Search } from "lucide-react";
import { SidebarMenuButton } from "@ohmyagentteam/ui/components/ui/sidebar";
import { isMac, formatShortcut, modKey } from "@ohmyagentteam/core/platform";
import { useSearchStore } from "./search-store";
import { useT } from "../i18n";

export function SearchTrigger({ compact = false }: { compact?: boolean } = {}) {
  const { t } = useT("search");
  if (compact) {
    return (
      <button
        type="button"
        aria-label={t(($) => $.trigger.label)}
        title={t(($) => $.trigger.label)}
        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border/80 bg-background px-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        onClick={() => useSearchStore.getState().setOpen(true)}
      >
        <Search className="size-3.5" />
        <span className="hidden xl:inline">{t(($) => $.trigger.label)}</span>
        <kbd className="hidden font-mono text-[9px] text-muted-foreground/70 2xl:inline-flex">
          {isMac ? `${modKey}K` : formatShortcut(modKey, "K")}
        </kbd>
      </button>
    );
  }
  return (
    <SidebarMenuButton
      className="text-muted-foreground"
      onClick={() => useSearchStore.getState().setOpen(true)}
    >
      <Search />
      <span>{t(($) => $.trigger.label)}</span>
      <kbd className="pointer-events-none ml-auto inline-flex h-5 select-none items-center gap-0.5 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
        {isMac ? (
          <>
            <span className="text-xs">{modKey}</span>K
          </>
        ) : (
          formatShortcut(modKey, "K")
        )}
      </kbd>
    </SidebarMenuButton>
  );
}
