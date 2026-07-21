"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  LogOut,
  Plus,
  Sparkles,
  SquarePen,
  Star,
  X,
} from "lucide-react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { cn } from "@ohmyagentteam/ui/lib/utils";
import { ActorAvatar } from "@ohmyagentteam/ui/components/common/actor-avatar";
import { BrandMark } from "@ohmyagentteam/ui/components/common/brand-mark";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@ohmyagentteam/ui/components/ui/tooltip";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebarSafe,
} from "@ohmyagentteam/ui/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@ohmyagentteam/ui/components/ui/dropdown-menu";
import { useAuthStore } from "@ohmyagentteam/core/auth";
import { api, ApiError } from "@ohmyagentteam/core/api";
import { BRAND_NAME } from "@ohmyagentteam/core/brand";
import { useConfigStore } from "@ohmyagentteam/core/config";
import {
  deduplicateInboxItems,
  hasOtherWorkspaceUnread,
  inboxKeys,
  inboxUnreadSummaryOptions,
  unreadWorkspaceIds,
} from "@ohmyagentteam/core/inbox/queries";
import { issueDetailOptions } from "@ohmyagentteam/core/issues/queries";
import { useIssueDraftStore } from "@ohmyagentteam/core/issues/stores/draft-store";
import { openCreateIssueWithPreference } from "@ohmyagentteam/core/issues/stores/create-mode-store";
import { useModalStore } from "@ohmyagentteam/core/modals";
import { useDeletePin, useReorderPins } from "@ohmyagentteam/core/pins/mutations";
import { pinListOptions } from "@ohmyagentteam/core/pins/queries";
import { paths, useCurrentWorkspace, useWorkspacePaths } from "@ohmyagentteam/core/paths";
import { projectDetailOptions } from "@ohmyagentteam/core/projects/queries";
import { epicDetailOptions } from "@ohmyagentteam/core/epics/queries";
import { useMyRuntimesNeedUpdate } from "@ohmyagentteam/core/runtimes/hooks";
import type { PinnedItem } from "@ohmyagentteam/core/types";
import {
  myInvitationListOptions,
  workspaceKeys,
  workspaceListOptions,
} from "@ohmyagentteam/core/workspace/queries";
import { resolvePublicFileUrl } from "@ohmyagentteam/core/workspace/avatar-url";
import { useLogout } from "../auth";
import { useT } from "../i18n";
import { StatusIcon } from "../issues/components/status-icon";
import { AppLink, useNavigation } from "../navigation";
import { ProjectIcon } from "../projects/components/project-icon";
import { WorkspaceAvatar } from "../workspace/workspace-avatar";
import { HelpLauncher } from "./help-launcher";
import {
  APP_NAV_SECTIONS,
  getActiveSection,
  isNavActive,
  resolveNavHref,
} from "./app-navigation";

const EMPTY_PINS: PinnedItem[] = [];
const EMPTY_WORKSPACES: Awaited<ReturnType<typeof api.listWorkspaces>> = [];
const EMPTY_INVITATIONS: Awaited<ReturnType<typeof api.listMyInvitations>> = [];
const EMPTY_INBOX: Awaited<ReturnType<typeof api.listInbox>> = [];
const EMPTY_INBOX_SUMMARY: Awaited<ReturnType<typeof api.getInboxUnreadSummary>> = [];

function DraftDot() {
  const hasDraft = useIssueDraftStore((state) => !!(state.draft.title || state.draft.description));
  if (!hasDraft) return null;
  return <span className="absolute -right-0.5 -top-0.5 size-1.5 rounded-full bg-[#ef6a5b]" />;
}

function SortablePinItem({
  pin,
  href,
  pathname,
  onUnpin,
  label,
  iconNode,
}: {
  pin: PinnedItem;
  href: string;
  pathname: string;
  onUnpin: () => void;
  label: string;
  iconNode: React.ReactNode;
}) {
  const { t } = useT("layout");
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: pin.id });
  const wasDragged = useRef(false);

  useEffect(() => {
    if (isDragging) wasDragged.current = true;
  }, [isDragging]);

  return (
    <SidebarMenuItem
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("group/pin", isDragging && "opacity-30")}
      {...attributes}
      {...listeners}
    >
      <SidebarMenuButton
        size="sm"
        isActive={pathname === href}
        render={<AppLink href={href} draggable={false} />}
        onClick={(event) => {
          if (!wasDragged.current) return;
          wasDragged.current = false;
          event.preventDefault();
        }}
        className="text-muted-foreground data-active:bg-accent data-active:text-foreground"
      >
        {iconNode}
        <span className="min-w-0 flex-1 truncate">{label}</span>
      </SidebarMenuButton>
      <Tooltip>
        <TooltipTrigger
          render={
            <SidebarMenuAction
              showOnHover
              aria-label={t(($) => $.sidebar.unpin_tooltip)}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onUnpin();
              }}
            />
          }
        >
          <X className="size-3" />
        </TooltipTrigger>
        <TooltipContent side="top">{t(($) => $.sidebar.unpin_tooltip)}</TooltipContent>
      </Tooltip>
    </SidebarMenuItem>
  );
}

function PinRow({
  pin,
  href,
  pathname,
  onUnpin,
  workspaceId,
}: {
  pin: PinnedItem;
  href: string;
  pathname: string;
  onUnpin: () => void;
  workspaceId: string;
}) {
  const isIssue = pin.item_type === "issue";
  const isEpic = pin.item_type === "epic";
  const issueQuery = useQuery({ ...issueDetailOptions(workspaceId, pin.item_id), enabled: isIssue });
  const epicQuery = useQuery({ ...epicDetailOptions(workspaceId, pin.item_id), enabled: isEpic });
  const projectQuery = useQuery({ ...projectDetailOptions(workspaceId, pin.item_id), enabled: pin.item_type === "project" });
  const triggeredRef = useRef(false);

  useEffect(() => {
    const error = isIssue ? issueQuery.error : isEpic ? epicQuery.error : projectQuery.error;
    if (error instanceof ApiError && error.status === 404 && !triggeredRef.current) {
      triggeredRef.current = true;
      onUnpin();
    }
  }, [epicQuery.error, isEpic, isIssue, issueQuery.error, onUnpin, projectQuery.error]);

  if (isIssue) {
    if (issueQuery.isPending) return <PinSkeleton />;
    if (issueQuery.isError || !issueQuery.data) return null;
    return (
      <SortablePinItem
        pin={pin}
        href={href}
        pathname={pathname}
        onUnpin={onUnpin}
        label={issueQuery.data.title}
        iconNode={<StatusIcon status={issueQuery.data.status} className="!size-3.5 shrink-0" />}
      />
    );
  }

  if (isEpic) {
    if (epicQuery.isPending) return <PinSkeleton />;
    if (epicQuery.isError || !epicQuery.data) return null;
    return (
      <SortablePinItem
        pin={pin}
        href={href}
        pathname={pathname}
        onUnpin={onUnpin}
        label={epicQuery.data.title}
        iconNode={<Sparkles className="!size-3.5 shrink-0" />}
      />
    );
  }

  if (projectQuery.isPending) return <PinSkeleton />;
  if (projectQuery.isError || !projectQuery.data) return null;
  return (
    <SortablePinItem
      pin={pin}
      href={href}
      pathname={pathname}
      onUnpin={onUnpin}
      label={projectQuery.data.title}
      iconNode={<ProjectIcon project={projectQuery.data} size="sm" />}
    />
  );
}

function PinSkeleton() {
  return (
    <SidebarMenuItem>
      <div className="flex h-8 items-center gap-2 px-2">
        <div className="size-3.5 rounded-sm bg-muted" />
        <div className="h-3 w-28 rounded-sm bg-muted" />
      </div>
    </SidebarMenuItem>
  );
}

interface AppSidebarProps {
  topSlot?: React.ReactNode;
  searchSlot?: React.ReactNode;
  headerClassName?: string;
  headerStyle?: React.CSSProperties;
}

export function AppSidebar({ topSlot, searchSlot, headerClassName, headerStyle }: AppSidebarProps = {}) {
  const { t } = useT("layout");
  const { pathname, push } = useNavigation();
  const sidebar = useSidebarSafe();
  const isMobileSidebar = sidebar?.isMobile;
  const setOpenMobile = sidebar?.setOpenMobile;
  const user = useAuthStore((state) => state.user);
  const userId = user?.id;
  const logout = useLogout();
  const workspace = useCurrentWorkspace();
  const workspacePaths = useWorkspacePaths();
  const activeSection = getActiveSection(pathname, workspacePaths);
  const { data: workspaces = EMPTY_WORKSPACES } = useQuery(workspaceListOptions());
  const { data: invitations = EMPTY_INVITATIONS } = useQuery(myInvitationListOptions());
  const workspaceCreationDisabled = useConfigStore((state) => state.workspaceCreationDisabled);

  useEffect(() => {
    if (isMobileSidebar) setOpenMobile?.(false);
  }, [isMobileSidebar, pathname, setOpenMobile]);

  const workspaceId = workspace?.id;
  const { data: inboxItems = EMPTY_INBOX } = useQuery({
    queryKey: workspaceId ? inboxKeys.list(workspaceId) : ["inbox", "disabled"],
    queryFn: () => api.listInbox(),
    enabled: !!workspaceId,
  });
  const unreadCount = React.useMemo(
    () => deduplicateInboxItems(inboxItems).filter((item) => !item.read).length,
    [inboxItems],
  );
  const { data: unreadSummary = EMPTY_INBOX_SUMMARY } = useQuery({
    ...inboxUnreadSummaryOptions(),
    enabled: !!workspaceId,
  });
  const otherWorkspaceUnread = React.useMemo(
    () => hasOtherWorkspaceUnread(unreadSummary, workspaceId),
    [unreadSummary, workspaceId],
  );
  const unreadWorkspaceSet = React.useMemo(() => unreadWorkspaceIds(unreadSummary), [unreadSummary]);
  const hasRuntimeUpdates = useMyRuntimesNeedUpdate(workspaceId);

  const { data: pinnedItems = EMPTY_PINS } = useQuery({
    ...pinListOptions(workspaceId ?? "", userId ?? ""),
    enabled: !!workspaceId && !!userId,
  });
  const deletePin = useDeletePin();
  const reorderPins = useReorderPins();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const getPinHref = useCallback(
    (pin: PinnedItem) =>
      pin.item_type === "issue"
        ? workspacePaths.issueDetail(pin.item_id)
        : pin.item_type === "epic"
          ? workspacePaths.epicDetail(pin.item_id)
          : workspacePaths.projectDetail(pin.item_id),
    [workspacePaths],
  );
  const [localPinned, setLocalPinned] = useState<PinnedItem[]>(pinnedItems);
  const draggingRef = useRef(false);

  useEffect(() => {
    if (!draggingRef.current) setLocalPinned(pinnedItems);
  }, [pinnedItems]);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      draggingRef.current = false;
      if (!event.over || event.active.id === event.over.id) return;
      const from = localPinned.findIndex((pin) => pin.id === event.active.id);
      const to = localPinned.findIndex((pin) => pin.id === event.over?.id);
      if (from < 0 || to < 0) return;
      const reordered = arrayMove(localPinned, from, to);
      setLocalPinned(reordered);
      reorderPins.mutate(reordered);
    },
    [localPinned, reorderPins],
  );

  const queryClient = useQueryClient();
  const acceptInvitation = useMutation({
    mutationFn: (id: string) => api.acceptInvitation(id),
    onSuccess: async (_, invitationId) => {
      const invitation = invitations.find((item) => item.id === invitationId);
      queryClient.invalidateQueries({ queryKey: workspaceKeys.myInvitations() });
      const list = await queryClient.fetchQuery({ ...workspaceListOptions(), staleTime: 0 });
      const joined = invitation ? list.find((item) => item.id === invitation.workspace_id) : null;
      if (joined) push(paths.workspace(joined.slug).issues());
    },
  });
  const declineInvitation = useMutation({
    mutationFn: (id: string) => api.declineInvitation(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: workspaceKeys.myInvitations() }),
  });

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "c" || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      const target = event.target as HTMLElement;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName) || target?.isContentEditable) return;
      if (useModalStore.getState().modal) return;
      event.preventDefault();
      const projectMatch = pathname.match(/^\/[^/]+\/projects\/([^/]+)$/);
      openCreateIssueWithPreference(projectMatch ? { project_id: projectMatch[1] } : undefined);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [pathname]);

  return (
    <Sidebar
      variant="sidebar"
      collapsible="offcanvas"
      className="border-r border-border bg-background text-foreground"
    >
      {topSlot}
      <SidebarHeader
        className={cn("items-center gap-3 border-b border-border px-3 py-4", headerClassName)}
        style={headerStyle}
      >
        <div className="flex w-full items-center justify-center gap-3 md:h-8">
          <BrandMark monochrome className="size-7 text-foreground" />
          <span className="truncate font-serif text-base font-medium md:sr-only">{BRAND_NAME}</span>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                aria-label={workspace?.name ?? BRAND_NAME}
                title={workspace?.name ?? BRAND_NAME}
                className="flex h-10 w-full items-center justify-center gap-2 rounded-md text-foreground/80 transition-colors hover:bg-accent hover:text-foreground md:size-10"
              >
                <span className="relative">
                  <WorkspaceAvatar name={workspace?.name ?? "O"} avatarUrl={workspace?.avatar_url} size="sm" />
                  {(invitations.length > 0 || otherWorkspaceUnread) && (
                    <span data-workspace-unread className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-brand ring-1 ring-sidebar" />
                  )}
                </span>
                <span className="min-w-0 flex-1 truncate text-left text-sm md:sr-only">{workspace?.name}</span>
                <ChevronDown className="size-3 md:hidden" />
              </button>
            }
          />
          <DropdownMenuContent align="start" side="right" sideOffset={10} className="min-w-64">
            <div className="flex items-center gap-2.5 px-2 py-2">
              <ActorAvatar
                name={user?.name ?? ""}
                initials={(user?.name ?? "U").charAt(0).toUpperCase()}
                avatarUrl={resolvePublicFileUrl(user?.avatar_url)}
                size={32}
              />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{user?.name}</p>
                <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
              </div>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel>{t(($) => $.sidebar.workspaces_label)}</DropdownMenuLabel>
              {workspaces.map((item) => (
                <DropdownMenuItem key={item.id} render={<AppLink href={paths.workspace(item.slug).issues()} />}>
                  <WorkspaceAvatar name={item.name} avatarUrl={item.avatar_url} size="sm" />
                  <span className="min-w-0 flex-1 truncate">{item.name}</span>
                  {item.id !== workspaceId && unreadWorkspaceSet.has(item.id) && <span className="size-2 rounded-full bg-brand" />}
                  {item.id === workspaceId && <Check className="size-3.5" />}
                </DropdownMenuItem>
              ))}
              {!workspaceCreationDisabled && (
                <DropdownMenuItem onClick={() => useModalStore.getState().open("create-workspace")}>
                  <Plus className="size-3.5" />
                  {t(($) => $.sidebar.create_workspace)}
                </DropdownMenuItem>
              )}
            </DropdownMenuGroup>
            {invitations.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>{t(($) => $.sidebar.pending_invitations_label)}</DropdownMenuLabel>
                {invitations.map((invitation) => (
                  <div key={invitation.id} className="flex items-center gap-2 px-2 py-1.5">
                    <span className="min-w-0 flex-1 truncate text-xs">{invitation.workspace_name}</span>
                    <button type="button" className="rounded bg-foreground px-2 py-1 text-[11px] text-background" onClick={() => acceptInvitation.mutate(invitation.id)}>
                      {t(($) => $.sidebar.invitation_join)}
                    </button>
                    <button type="button" className="rounded px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted" onClick={() => declineInvitation.mutate(invitation.id)}>
                      {t(($) => $.sidebar.invitation_decline)}
                    </button>
                  </div>
                ))}
              </>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={logout}>
              <LogOut className="size-3.5" />
              {t(($) => $.sidebar.log_out)}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {searchSlot ? <div className="w-full md:hidden">{searchSlot}</div> : null}
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                aria-label={t(($) => $.sidebar.new_issue)}
                onClick={() => openCreateIssueWithPreference()}
                className="flex h-10 w-full items-center justify-center gap-2 rounded-md bg-brand text-brand-foreground transition-colors hover:bg-brand/90 md:size-10"
              />
            }
          >
            <span className="relative"><SquarePen className="size-4" /><DraftDot /></span>
            <span className="flex-1 text-left text-sm font-medium md:sr-only">{t(($) => $.sidebar.new_issue)}</span>
          </TooltipTrigger>
          <TooltipContent side="right" className="hidden md:block">{t(($) => $.sidebar.new_issue)}</TooltipContent>
        </Tooltip>
      </SidebarHeader>

      <SidebarContent className="items-center gap-2 px-3 py-4">
        <nav className="flex w-full flex-col items-center gap-1" aria-label={t(($) => $.shell.section_navigation)}>
          {APP_NAV_SECTIONS.map((section) => {
            const href = resolveNavHref(workspacePaths, section.items[0]!.key);
            const active = activeSection.key === section.key;
            const showUnread = section.key === "work" && unreadCount > 0;
            const showRuntimeUpdate = section.key === "capabilities" && hasRuntimeUpdates;
            return (
              <Tooltip key={section.key}>
                <TooltipTrigger
                  render={
                    <AppLink
                      href={href}
                      aria-current={active ? "page" : undefined}
                      aria-label={t(($) => $.shell.sections[section.key])}
                      className={cn(
                        "relative flex h-11 w-full items-center justify-start gap-3 rounded-md px-3 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground md:size-11 md:justify-center md:px-0",
                        active && "bg-foreground text-background hover:bg-foreground hover:text-background",
                      )}
                    />
                  }
                >
                  <section.icon className="size-[18px] shrink-0" />
                  <span className="truncate text-sm md:sr-only">{t(($) => $.shell.sections[section.key])}</span>
                  {showUnread && (
                    <span className={cn("ml-auto text-[10px] tabular-nums md:absolute md:-right-0.5 md:-top-0.5 md:flex md:size-4 md:items-center md:justify-center md:rounded-full", active ? "text-background md:bg-brand md:text-brand-foreground" : "text-brand md:bg-brand md:text-brand-foreground")}>{unreadCount > 9 ? "9+" : unreadCount}</span>
                  )}
                  {showRuntimeUpdate && <span className="ml-auto size-1.5 rounded-full bg-[#ef6a5b] md:absolute md:right-1 md:top-1" />}
                </TooltipTrigger>
                <TooltipContent side="right" className="hidden md:block">{t(($) => $.shell.sections[section.key])}</TooltipContent>
              </Tooltip>
            );
          })}
        </nav>

        {localPinned.length > 0 && (
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger
                render={
                  <DropdownMenuTrigger
                    aria-label={t(($) => $.shell.favorites)}
                    className="mt-2 flex h-11 w-full items-center justify-start gap-3 rounded-md px-3 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground md:size-11 md:justify-center md:px-0"
                  />
                }
              >
                <Star className="size-[18px]" />
                <span className="truncate text-sm md:sr-only">{t(($) => $.shell.favorites)}</span>
              </TooltipTrigger>
              <TooltipContent side="right" className="hidden md:block">{t(($) => $.shell.favorites)}</TooltipContent>
            </Tooltip>
            <DropdownMenuContent side="right" align="start" sideOffset={10} className="w-72 p-2">
              <DropdownMenuLabel>{t(($) => $.shell.favorites)}</DropdownMenuLabel>
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragStart={() => { draggingRef.current = true; }}
                onDragEnd={handleDragEnd}
              >
                <SortableContext items={localPinned.map((pin) => pin.id)} strategy={verticalListSortingStrategy}>
                  <SidebarMenu>
                    {localPinned.map((pin) => (
                      <PinRow
                        key={pin.id}
                        pin={pin}
                        href={getPinHref(pin)}
                        pathname={pathname}
                        workspaceId={workspaceId ?? ""}
                        onUnpin={() => deletePin.mutate({ itemType: pin.item_type, itemId: pin.item_id })}
                      />
                    ))}
                  </SidebarMenu>
                </SortableContext>
              </DndContext>
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        <div className="mt-3 w-full border-t border-border pt-3 md:hidden">
          {APP_NAV_SECTIONS.map((section) => (
            <div key={section.key} className="mb-4">
              <p className="mb-1 px-3 text-[10px] font-medium uppercase text-muted-foreground">{t(($) => $.shell.sections[section.key])}</p>
              {section.items.map((item) => {
                const href = resolveNavHref(workspacePaths, item.key);
                return (
                  <AppLink key={item.key} href={href} className={cn("flex h-9 items-center gap-3 rounded-md px-3 text-sm text-muted-foreground", isNavActive(pathname, href) && "bg-accent text-foreground")}>
                    <item.icon className="size-4" />
                    {t(($) => $.nav[item.labelKey])}
                  </AppLink>
                );
              })}
            </div>
          ))}
        </div>
      </SidebarContent>

      <SidebarFooter className="items-center border-t border-border p-3 text-muted-foreground [&_button]:text-muted-foreground">
        <HelpLauncher />
      </SidebarFooter>
    </Sidebar>
  );
}
