import type { Metadata } from "next";
import { OhMyAgentTeamLanding } from "@/features/landing/components/ohmyagentteam-landing";
import { RedirectIfAuthenticated } from "@/features/landing/components/redirect-if-authenticated";

export const metadata: Metadata = {
  title: {
    absolute: "OhMyAgentTeam — People and agents, one team",
  },
  description:
    "Plan work, delegate to people or agents, and collaborate in one shared workspace.",
  openGraph: {
    title: "OhMyAgentTeam — People and agents, one team",
    description:
      "Manage your human + agent workforce in one place.",
    url: "/",
  },
  alternates: {
    canonical: "/",
  },
};

export default function LandingPage() {
  return (
    <>
      <RedirectIfAuthenticated />
      <OhMyAgentTeamLanding />
    </>
  );
}
