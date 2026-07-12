"use client";

import { use } from "react";
import { EpicDetail } from "@ohmyagentteam/views/epics/components";
import { ErrorBoundary } from "@ohmyagentteam/ui/components/common/error-boundary";

export default function EpicDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <ErrorBoundary resetKeys={[id]}>
      <EpicDetail epicId={id} />
    </ErrorBoundary>
  );
}
