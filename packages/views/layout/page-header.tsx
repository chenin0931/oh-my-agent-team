"use client";

import { cn } from "@ohmyagentteam/ui/lib/utils";

interface PageHeaderProps {
  children: React.ReactNode;
  className?: string;
}

export function PageHeader({ children, className }: PageHeaderProps) {
  return (
    <div
      data-omat-page-header
      className={cn(
        "flex min-h-[72px] shrink-0 items-center border-b border-border/60 bg-[var(--shell-background)] px-4 py-3 sm:px-6 lg:px-8",
        className,
      )}
    >
      {children}
    </div>
  );
}
