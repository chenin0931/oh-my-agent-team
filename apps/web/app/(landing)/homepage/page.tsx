import type { Metadata } from "next";
import { OhMyAgentTeamLanding } from "@/features/landing/components/ohmyagentteam-landing";

export const metadata: Metadata = {
  title: "Homepage",
  description:
    "OhMyAgentTeam brings people and Agents into one shared collaboration network.",
  openGraph: {
    title: "OhMyAgentTeam — Human and Agent Collaboration",
    description:
      "Manage your human + agent workforce in one place.",
    url: "/homepage",
  },
  alternates: {
    canonical: "/homepage",
  },
};

export default function HomepagePage() {
  return <OhMyAgentTeamLanding />;
}
