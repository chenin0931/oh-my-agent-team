"use client";

import { use } from "react";
import { IssueDetailEntry } from "@ohmyagentteam/views/issues/components";
import { ErrorBoundary } from "@ohmyagentteam/ui/components/common/error-boundary";

export default function IssueDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return (
    <ErrorBoundary resetKeys={[id]}>
      <IssueDetailEntry issueId={id} />
    </ErrorBoundary>
  );
}
