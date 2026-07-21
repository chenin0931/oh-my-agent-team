"use client";

import { useState } from "react";
import { ChevronDown, FolderMinus, ListTodo, Orbit } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@ohmyagentteam/ui/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@ohmyagentteam/ui/components/ui/dropdown-menu";
import type { Issue } from "@ohmyagentteam/core/types";
import { useWorkspaceId } from "@ohmyagentteam/core/hooks";
import { projectListOptions } from "@ohmyagentteam/core/projects/queries";
import { useIssuesScopeStore } from "@ohmyagentteam/core/issues/stores/issues-scope-store";
import {
  useViewStore,
  useViewStoreApi,
} from "@ohmyagentteam/core/issues/stores/view-store-context";
import { PageHeader } from "../../layout/page-header";
import { useT } from "../../i18n";
import { ProjectIcon } from "../../projects/components/project-icon";
import { IssueSurface } from "../surface/issue-surface";
import { IssuesHeader } from "./issues-header";

const ALL_PROJECTS_VALUE = "__all_projects__";
const NO_PROJECT_VALUE = "__no_project__";

function WorkItemScopeSwitcher() {
  const { t } = useT("issues");
  const wsId = useWorkspaceId();
  const { data: projects = [] } = useQuery(projectListOptions(wsId));
  const projectFilters = useViewStore((s) => s.projectFilters);
  const includeNoProject = useViewStore((s) => s.includeNoProject);
  const viewStore = useViewStoreApi();
  const [search, setSearch] = useState("");

  const selectedProject =
    projectFilters.length === 1 && !includeNoProject
      ? projects.find((project) => project.id === projectFilters[0])
      : undefined;
  const selectedScopeCount =
    projectFilters.length + (includeNoProject ? 1 : 0);
  const selectedValue =
    selectedScopeCount === 0
      ? ALL_PROJECTS_VALUE
      : includeNoProject && projectFilters.length === 0
        ? NO_PROJECT_VALUE
        : projectFilters.length === 1 && !includeNoProject
          ? projectFilters[0]!
          : "";
  const scopeLabel =
    selectedScopeCount === 0
      ? t(($) => $.page.breadcrumb_title)
      : selectedProject
        ? selectedProject.title
        : includeNoProject && projectFilters.length === 0
          ? t(($) => $.filters.no_project)
          : t(($) => $.page.project_scope_selected, {
              count: selectedScopeCount,
            });
  const query = search.trim().toLowerCase();
  const filteredProjects = projects.filter((project) =>
    project.title.toLowerCase().includes(query),
  );
  const allLabel = t(($) => $.page.breadcrumb_title);
  const noProjectLabel = t(($) => $.filters.no_project);
  const showAll = !query || allLabel.toLowerCase().includes(query);
  const showNoProject =
    !query || noProjectLabel.toLowerCase().includes(query);
  const hasResults =
    showAll || showNoProject || filteredProjects.length > 0;

  const setProjectScope = (value: string) => {
    if (value === ALL_PROJECTS_VALUE) {
      viewStore.setState({ projectFilters: [], includeNoProject: false });
      return;
    }
    if (value === NO_PROJECT_VALUE) {
      viewStore.setState({ projectFilters: [], includeNoProject: true });
      return;
    }
    viewStore.setState({
      projectFilters: [value],
      includeNoProject: false,
    });
  };

  return (
    <h1 className="min-w-0">
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="sm"
              className="-ml-2 h-9 max-w-[70vw] min-w-0 gap-2 px-2 font-serif text-lg font-semibold sm:max-w-xl"
              title={scopeLabel}
            >
              {selectedProject ? (
                <ProjectIcon project={selectedProject} size="md" />
              ) : includeNoProject && projectFilters.length === 0 ? (
                <FolderMinus className="size-4 shrink-0 text-muted-foreground" />
              ) : (
                <ListTodo className="size-4 shrink-0 text-muted-foreground" />
              )}
              <span className="truncate">{scopeLabel}</span>
              <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
            </Button>
          }
        />
        <DropdownMenuContent align="start" className="w-64 p-0">
          <div className="border-b border-foreground/5 px-2 py-1.5">
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t(($) => $.filters.placeholder)}
              className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              autoFocus
            />
          </div>
          <div className="max-h-72 overflow-y-auto p-1">
            <DropdownMenuRadioGroup
              value={selectedValue}
              onValueChange={setProjectScope}
            >
              {showAll && (
                <DropdownMenuRadioItem value={ALL_PROJECTS_VALUE}>
                  <ListTodo className="size-3.5 text-muted-foreground" />
                  <span className="truncate">{allLabel}</span>
                </DropdownMenuRadioItem>
              )}
              {showNoProject && (
                <DropdownMenuRadioItem value={NO_PROJECT_VALUE}>
                  <FolderMinus className="size-3.5 text-muted-foreground" />
                  <span className="truncate">{noProjectLabel}</span>
                </DropdownMenuRadioItem>
              )}
              {(showAll || showNoProject) && filteredProjects.length > 0 && (
                <DropdownMenuSeparator />
              )}
              {filteredProjects.map((project) => (
                <DropdownMenuRadioItem key={project.id} value={project.id}>
                  <ProjectIcon project={project} size="sm" />
                  <span className="truncate">{project.title}</span>
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
            {!hasResults && (
              <div className="px-2 py-3 text-center text-sm text-muted-foreground">
                {t(($) => $.filters.no_results)}
              </div>
            )}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </h1>
  );
}

function IssuesSurfaceHeader({
  issues,
  isRefreshing,
}: {
  issues: Issue[];
  isRefreshing: boolean;
}) {
  const dateFilter = useViewStore((s) => s.dateFilter);
  const setDateFilter = useViewStore((s) => s.setDateFilter);

  return (
    <IssuesHeader
      scopedIssues={issues}
      dateFilter={dateFilter}
      onDateFilterChange={setDateFilter}
      isRefreshing={isRefreshing}
      showPlanningQuickCreate
    />
  );
}

export function IssuesPage() {
  const { t } = useT("issues");
  const scope = useIssuesScopeStore((s) => s.scope);

  return (
    <div className="flex flex-1 min-h-0 flex-col">
      <IssueSurface
        scope={{ type: "workspace", actorKind: scope }}
        modes={["board", "list", "swimlane"]}
        batchToolbar="list"
        renderHeader={({ controller }) => (
          <>
            <PageHeader className="min-h-[84px] justify-between">
              <div className="min-w-0">
                <p className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase text-muted-foreground">
                  <Orbit className="size-3 text-brand" />
                  {t(($) => $.page.workspace_label)}
                </p>
                <WorkItemScopeSwitcher />
              </div>
              <div className="hidden items-baseline gap-2 sm:flex">
                <span className="font-serif text-2xl font-semibold tabular-nums">
                  {controller.surfaceIssues.length}
                </span>
                <span className="text-xs text-muted-foreground">
                  {t(($) => $.page.items_count_label)}
                </span>
              </div>
            </PageHeader>
            <IssuesSurfaceHeader
              issues={controller.surfaceIssues}
              isRefreshing={controller.isRefreshing}
            />
          </>
        )}
        renderEmpty={() => (
          <div className="flex flex-1 min-h-0 flex-col items-center justify-center gap-2 text-muted-foreground">
            <ListTodo className="h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm">{t(($) => $.page.empty_title)}</p>
            <p className="text-xs">{t(($) => $.page.empty_hint)}</p>
          </div>
        )}
      />
    </div>
  );
}
