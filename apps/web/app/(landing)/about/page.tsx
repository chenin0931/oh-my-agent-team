import type { Metadata } from "next";
import { AboutPageClient } from "@/features/landing/components/about-page-client";

export const metadata: Metadata = {
  title: "About",
  description:
    "Learn why OhMyAgentTeam is building a shared operating system for people and Agents.",
  openGraph: {
    title: "About OhMyAgentTeam",
    description:
      "The story behind OhMyAgentTeam and why human and Agent work belongs in one shared network.",
    url: "/about",
  },
  alternates: {
    canonical: "/about",
  },
};

export default function AboutPage() {
  return <AboutPageClient />;
}
