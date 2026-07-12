"use client";

import { IssuesPage } from "@ohmyagentteam/views/issues/components";
import { ErrorBoundary } from "@ohmyagentteam/ui/components/common/error-boundary";

export default function Page() {
  return (
    <ErrorBoundary>
      <IssuesPage />
    </ErrorBoundary>
  );
}
