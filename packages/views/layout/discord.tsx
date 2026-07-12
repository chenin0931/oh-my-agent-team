import { MessagesSquare } from "lucide-react";

/** Community link shared by the help launcher and sidebar card. */
export const DISCORD_URL =
  "https://github.com/chenin0931/oh-my-agent-team/discussions";

export function DiscordIcon({ className }: { className?: string }) {
  return <MessagesSquare aria-hidden="true" className={className} />;
}
