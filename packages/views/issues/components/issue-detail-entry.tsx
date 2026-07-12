"use client";

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { issueDetailOptions } from "@ohmyagentteam/core/issues/queries";
import { useWorkspaceId } from "@ohmyagentteam/core/hooks";
import { useWorkspacePaths } from "@ohmyagentteam/core/paths";
import { useNavigation } from "../../navigation";
import { IssueDetail, type IssueDetailProps } from "./issue-detail";

export function IssueDetailEntry(props: IssueDetailProps) {
  const wsId = useWorkspaceId();
  const paths = useWorkspacePaths();
  const navigation = useNavigation();
  const { data: issue } = useQuery(issueDetailOptions(wsId, props.issueId));
  const isEpic = issue?.issue_type === "epic";

  useEffect(() => {
    if (isEpic) navigation.replace(paths.epicDetail(props.issueId));
  }, [isEpic, navigation, paths, props.issueId]);

  if (!issue || isEpic) return null;
  return <IssueDetail {...props} />;
}
