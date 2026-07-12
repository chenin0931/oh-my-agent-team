"use client";

import {
  ArrowUpRight,
  BookOpen,
  CircleHelp,
  History,
  MessageCircle,
  Presentation,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@ohmyagentteam/ui/components/ui/dropdown-menu";
import { useModalStore } from "@ohmyagentteam/core/modals";
import { useProductTourStore } from "@ohmyagentteam/core/workspace/product-tour-store";
import { DISCORD_URL, DiscordIcon } from "./discord";
import { useT } from "../i18n";

const DOCS_URL = "https://ohmyagentteam.com/docs";
const CHANGELOG_URL = "https://ohmyagentteam.com/changelog";

export function HelpLauncher() {
  const { t } = useT("layout");
  const openProductTour = useProductTourStore((state) => state.open);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t(($) => $.help.trigger)}
        title={t(($) => $.help.trigger)}
        className="inline-flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors cursor-pointer hover:bg-accent hover:text-foreground data-popup-open:bg-accent data-popup-open:text-foreground"
      >
        <CircleHelp className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        side="top"
        sideOffset={8}
        className="min-w-40"
      >
        <DropdownMenuItem onClick={openProductTour}>
          <Presentation className="h-3.5 w-3.5" />
          {t(($) => $.help.product_tour)}
        </DropdownMenuItem>
        <DropdownMenuItem
          render={
            <a href={DOCS_URL} target="_blank" rel="noopener noreferrer" />
          }
        >
          <BookOpen className="h-3.5 w-3.5" />
          {t(($) => $.help.docs)}
          <ArrowUpRight className="size-3 translate-y-px text-muted-foreground/50" />
        </DropdownMenuItem>
        <DropdownMenuItem
          render={
            <a
              href={CHANGELOG_URL}
              target="_blank"
              rel="noopener noreferrer"
            />
          }
        >
          <History className="h-3.5 w-3.5" />
          {t(($) => $.help.changelog)}
          <ArrowUpRight className="size-3 translate-y-px text-muted-foreground/50" />
        </DropdownMenuItem>
        <DropdownMenuItem
          render={
            <a href={DISCORD_URL} target="_blank" rel="noopener noreferrer" />
          }
        >
          <DiscordIcon className="h-3.5 w-3.5" />
          {t(($) => $.help.discord)}
          <ArrowUpRight className="size-3 translate-y-px text-muted-foreground/50" />
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => useModalStore.getState().open("feedback")}
        >
          <MessageCircle className="h-3.5 w-3.5" />
          {t(($) => $.help.feedback)}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
