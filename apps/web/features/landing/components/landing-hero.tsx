"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Download } from "lucide-react";
import { useAuthStore } from "@ohmyagentteam/core/auth";
import { BRAND_NAME } from "@ohmyagentteam/core/brand";
import { ProviderLogo } from "@ohmyagentteam/views/runtimes";
import { cn } from "@ohmyagentteam/ui/lib/utils";
import { useLocale } from "../i18n";

const heroButton = (tone: "solid" | "outline") =>
  cn(
    "inline-flex h-11 items-center justify-center gap-2 rounded-md px-5 text-sm font-medium transition-colors",
    tone === "solid"
      ? "bg-[#171714] text-white hover:bg-[#2a2a25]"
      : "border border-[#171714]/18 bg-white/85 text-[#171714] hover:bg-white",
  );

export function LandingHero() {
  const { t } = useLocale();
  const user = useAuthStore((s) => s.user);

  return (
    <main className="relative min-h-[calc(88svh-76px)] overflow-hidden bg-white text-[#171714]">
      <Image
        src="/images/landing-hero.png"
        alt={t.hero.imageAlt}
        fill
        priority
        className="object-contain object-bottom"
        sizes="100vw"
        quality={88}
      />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[58%] bg-white/94" />

      <section id="product" className="relative z-10 mx-auto max-w-[1180px] px-5 pb-[38vh] pt-14 text-center sm:px-8 sm:pt-16 lg:pt-20">
        <h1 className="font-[family-name:var(--font-serif)] text-6xl font-normal leading-none sm:text-7xl lg:text-8xl">
          {BRAND_NAME}
        </h1>
        <p className="mx-auto mt-5 max-w-[900px] font-[family-name:var(--font-serif)] text-3xl leading-tight text-[#171714]/92 sm:text-4xl lg:text-5xl">
          {t.hero.headlineLine1} {t.hero.headlineLine2}
        </p>
        <p className="mx-auto mt-5 max-w-[760px] text-[15px] leading-7 text-[#171714]/64 sm:text-base">
          {t.hero.subheading}
        </p>

        <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
          <Link href={user ? "/" : "/login"} className={heroButton("solid")}>
            {user ? t.header.dashboard : t.hero.cta}
          </Link>
          <Link href="/download" className={heroButton("outline")}>
            <Download className="size-4" aria-hidden />
            {t.hero.downloadDesktop}
          </Link>
          <Link
            href="/contact-sales"
            className="group inline-flex h-11 items-center justify-center gap-1.5 px-3 text-sm font-medium text-[#171714]/64 hover:text-[#171714]"
          >
            {t.hero.talkToSales}
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
          </Link>
        </div>

        <div className="mt-7 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm text-[#171714]/55">
          <span>{t.hero.worksWith}</span>
          <ToolMark provider="codex" label="Codex" />
          <ToolMark provider="claude" label="Claude Code" />
          <ToolMark provider="codebuddy" label="WorkBuddy" />
        </div>
      </section>
    </main>
  );
}

function ToolMark({ provider, label }: { provider: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-[#171714]/72">
      <ProviderLogo provider={provider} className="size-4" />
      <span className="font-medium">{label}</span>
    </span>
  );
}
