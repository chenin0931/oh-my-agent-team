"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  Check,
  Circle,
  CircleCheck,
  Clock3,
  FolderKanban,
  Inbox,
  ListTodo,
  MessageSquare,
  Network,
  Play,
  Radio,
  Send,
  Server,
  Sparkles,
  User,
  Users,
} from "lucide-react";
import { Button } from "@ohmyagentteam/ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@ohmyagentteam/ui/components/ui/dialog";
import { cn } from "@ohmyagentteam/ui/lib/utils";
import { useT } from "../i18n";
import productTourNetworkImage from "./assets/product-tour-network.png";

const productTourNetworkImageSrc =
  (productTourNetworkImage as unknown as { src?: string }).src ??
  (productTourNetworkImage as unknown as string);

const SLIDE_IDS = [
  "network",
  "projects",
  "planning",
  "workflow",
  "human",
  "runtime",
] as const;

type ProductTourSlideId = (typeof SLIDE_IDS)[number];

interface ProductTourSlide {
  id: ProductTourSlideId;
  eyebrow: string;
  title: string;
  description: string;
  bullets: string[];
}

export function ProductTour({
  open,
  onComplete,
}: {
  open: boolean;
  onComplete: () => void;
}) {
  const { t } = useT("workspace");
  const [index, setIndex] = useState(0);
  const slides = useMemo<ProductTourSlide[]>(
    () =>
      SLIDE_IDS.map((id) => ({
        id,
        eyebrow: t(($) => $.product_tour.slides[id].eyebrow),
        title: t(($) => $.product_tour.slides[id].title),
        description: t(($) => $.product_tour.slides[id].description),
        bullets: [
          t(($) => $.product_tour.slides[id].bullet_1),
          t(($) => $.product_tour.slides[id].bullet_2),
        ],
      })),
    [t],
  );

  useEffect(() => {
    if (open) setIndex(0);
  }, [open]);

  const slide = slides[index]!;
  const isFirst = index === 0;
  const isLast = index === slides.length - 1;
  const previous = () => setIndex((value) => Math.max(0, value - 1));
  const next = () => {
    if (isLast) {
      onComplete();
      return;
    }
    setIndex((value) => Math.min(slides.length - 1, value + 1));
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onComplete();
      }}
    >
      <DialogContent
        className="h-[min(760px,calc(100svh-2rem))] w-[min(1120px,calc(100vw-2rem))] max-w-none gap-0 overflow-hidden rounded-lg p-0 sm:max-w-none"
        aria-describedby={`product-tour-description-${slide.id}`}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft" && !isFirst) previous();
          if (event.key === "ArrowRight") next();
        }}
      >
        <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_auto]">
          <div className="grid min-h-0 grid-rows-[auto_minmax(240px,1fr)] overflow-y-auto md:grid-cols-[minmax(280px,360px)_minmax(0,1fr)] md:grid-rows-1 md:overflow-hidden">
            <section
              key={`copy-${slide.id}`}
              className="flex min-h-0 flex-col justify-center border-b px-6 py-7 md:border-r md:border-b-0 md:px-9 md:py-10 motion-reduce:animate-none animate-in fade-in slide-in-from-left-2 duration-300"
            >
              <p className="text-xs font-medium uppercase text-muted-foreground">
                {slide.eyebrow}
              </p>
              <DialogTitle className="mt-3 text-3xl font-semibold leading-tight">
                {slide.title}
              </DialogTitle>
              <DialogDescription
                id={`product-tour-description-${slide.id}`}
                className="mt-4 text-[15px] leading-6 text-muted-foreground"
              >
                {slide.description}
              </DialogDescription>
              <div className="mt-6 space-y-3">
                {slide.bullets.map((bullet) => (
                  <div key={bullet} className="flex items-start gap-2.5">
                    <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
                      <Check className="size-3" />
                    </span>
                    <p className="text-sm leading-5 text-foreground/85">
                      {bullet}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            <div
              key={`visual-${slide.id}`}
              className="min-h-0 motion-reduce:animate-none animate-in fade-in slide-in-from-right-2 duration-300"
            >
              <TourVisual slideId={slide.id} />
            </div>
          </div>

          <footer className="flex h-16 shrink-0 items-center gap-2 border-t bg-background px-3 sm:gap-3 md:px-7">
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                "px-2 text-muted-foreground sm:px-3",
                !isFirst && "hidden sm:inline-flex",
              )}
              onClick={onComplete}
            >
              {t(($) => $.product_tour.skip)}
            </Button>

            <div className="flex flex-1 items-center justify-center gap-1.5">
              {slides.map((item, itemIndex) => (
                <button
                  key={item.id}
                  type="button"
                  className={cn(
                    "h-1.5 rounded-full transition-all",
                    itemIndex === index
                      ? "w-6 bg-foreground"
                      : "w-1.5 bg-foreground/20 hover:bg-foreground/40",
                  )}
                  aria-label={t(($) => $.product_tour.go_to_slide, {
                    count: itemIndex + 1,
                  })}
                  aria-current={itemIndex === index ? "step" : undefined}
                  onClick={() => setIndex(itemIndex)}
                />
              ))}
            </div>

            <div className="flex min-w-0 items-center justify-end gap-2 sm:min-w-[172px]">
              {!isFirst && (
                <Button variant="outline" size="sm" onClick={previous}>
                  <ArrowLeft className="size-3.5" />
                  <span className="hidden sm:inline">
                    {t(($) => $.product_tour.back)}
                  </span>
                </Button>
              )}
              <Button size="sm" onClick={next}>
                {isLast
                  ? t(($) => $.product_tour.finish)
                  : t(($) => $.product_tour.next)}
                <ArrowRight className="size-3.5" />
              </Button>
            </div>
          </footer>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TourVisual({ slideId }: { slideId: ProductTourSlideId }) {
  switch (slideId) {
    case "network":
      return <NetworkVisual />;
    case "projects":
      return <ProjectVisual />;
    case "planning":
      return <PlanningVisual />;
    case "workflow":
      return <WorkflowVisual />;
    case "human":
      return <HumanAdvisorVisual />;
    case "runtime":
      return <RuntimeVisual />;
  }
}

function VisualStage({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative flex h-full min-h-[240px] items-center justify-center overflow-hidden bg-[#f4f5f3] p-5 dark:bg-[#171917] md:min-h-[280px] md:p-8",
        className,
      )}
    >
      {children}
    </div>
  );
}

function NetworkVisual() {
  return (
    <VisualStage className="p-0">
      <img
        src={productTourNetworkImageSrc}
        alt=""
        aria-hidden
        className="h-full w-full object-cover"
      />
    </VisualStage>
  );
}

function ProjectVisual() {
  const { t } = useT("workspace");
  const items = [
    {
      title: t(($) => $.product_tour.visual.project_item_1),
      tone: "bg-emerald-500",
      actor: <Bot className="size-3" />,
    },
    {
      title: t(($) => $.product_tour.visual.project_item_2),
      tone: "bg-amber-400",
      actor: <User className="size-3" />,
    },
    {
      title: t(($) => $.product_tour.visual.project_item_3),
      tone: "bg-cyan-500",
      actor: <Users className="size-3" />,
    },
  ];

  return (
    <VisualStage>
      <div className="w-full max-w-xl overflow-hidden rounded-lg border bg-background shadow-sm">
        <div className="flex items-center gap-3 border-b px-5 py-4">
          <span className="flex size-9 items-center justify-center rounded-md bg-amber-400/15 text-amber-700 dark:text-amber-300">
            <FolderKanban className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">
              {t(($) => $.product_tour.visual.project_title)}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t(($) => $.product_tour.visual.project_summary)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-lg font-semibold tabular-nums">50%</p>
            <p className="text-[11px] text-muted-foreground">
              {t(($) => $.product_tour.visual.complete)}
            </p>
          </div>
        </div>
        <div className="h-1 bg-muted">
          <div className="h-full w-1/2 bg-emerald-500" />
        </div>
        <div className="divide-y">
          {items.map((item, index) => (
            <div key={item.title} className="flex items-center gap-3 px-5 py-3.5">
              <span className={cn("size-2 rounded-full", item.tone)} />
              <span className="w-12 shrink-0 text-xs text-muted-foreground">
                WI-{index + 1}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm">
                {item.title}
              </span>
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full border bg-muted/50 text-muted-foreground">
                {item.actor}
              </span>
            </div>
          ))}
        </div>
      </div>
    </VisualStage>
  );
}

function PlanningVisual() {
  const { t } = useT("workspace");
  const planned = [
    {
      title: t(($) => $.product_tour.visual.plan_item_1),
      actor: t(($) => $.product_tour.visual.product_agent),
      icon: <Bot className="size-3" />,
      color: "border-l-emerald-500",
    },
    {
      title: t(($) => $.product_tour.visual.plan_item_2),
      actor: t(($) => $.product_tour.visual.growth_agent),
      icon: <Sparkles className="size-3" />,
      color: "border-l-cyan-500",
    },
    {
      title: t(($) => $.product_tour.visual.plan_item_3),
      actor: t(($) => $.product_tour.visual.you),
      icon: <User className="size-3" />,
      color: "border-l-amber-400",
    },
  ];

  return (
    <VisualStage>
      <div className="w-full max-w-2xl">
        <div className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2.5 shadow-sm">
          <Sparkles className="size-4 shrink-0 text-emerald-600" />
          <p className="min-w-0 flex-1 truncate text-sm text-foreground/80">
            {t(($) => $.product_tour.visual.planning_prompt)}
          </p>
          <span className="flex size-7 items-center justify-center rounded-md bg-foreground text-background">
            <Send className="size-3.5" />
          </span>
        </div>

        <div className="my-4 flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <span className="h-px w-12 bg-border" />
          <Sparkles className="size-3.5 text-emerald-600" />
          {t(($) => $.product_tour.visual.analyzing)}
          <span className="h-px w-12 bg-border" />
        </div>

        <div className="grid gap-2.5 sm:grid-cols-3">
          {planned.map((item) => (
            <div
              key={item.title}
              className={cn(
                "rounded-lg border border-l-4 bg-background p-3 shadow-sm",
                item.color,
              )}
            >
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Clock3 className="size-3" />
                {t(($) => $.product_tour.visual.backlog)}
              </div>
              <p className="mt-2 min-h-10 text-sm font-medium leading-5">
                {item.title}
              </p>
              <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="flex size-5 items-center justify-center rounded-full bg-muted">
                  {item.icon}
                </span>
                <span className="truncate">{item.actor}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </VisualStage>
  );
}

function WorkflowVisual() {
  const { t } = useT("workspace");
  const statuses = [
    { key: "backlog", icon: <Circle className="size-3.5" />, tone: "text-muted-foreground" },
    { key: "todo", icon: <Play className="size-3.5" />, tone: "text-amber-600" },
    { key: "in_progress", icon: <Radio className="size-3.5" />, tone: "text-cyan-600" },
    { key: "in_review", icon: <MessageSquare className="size-3.5" />, tone: "text-emerald-600" },
    { key: "done", icon: <CircleCheck className="size-3.5" />, tone: "text-emerald-600" },
  ] as const;

  return (
    <VisualStage>
      <div className="w-full max-w-2xl overflow-hidden rounded-lg border bg-background shadow-sm">
        <div className="grid grid-cols-5 border-b">
          {statuses.map((status, index) => (
            <div
              key={status.key}
              className={cn(
                "flex min-w-0 flex-col items-center gap-1.5 border-r px-1 py-3 text-center last:border-r-0",
                index === 2 && "bg-cyan-500/8",
              )}
            >
              <span className={status.tone}>{status.icon}</span>
              <span className="truncate text-[10px] font-medium sm:text-xs">
                {t(($) => $.product_tour.visual.status[status.key])}
              </span>
            </div>
          ))}
        </div>

        <div className="grid md:grid-cols-[180px_1fr]">
          <div className="border-b p-4 md:border-r md:border-b-0">
            <p className="text-xs font-medium text-muted-foreground">
              {t(($) => $.product_tour.visual.execution_rule)}
            </p>
            <div className="mt-3 space-y-2.5">
              <div className="flex items-center gap-2 text-xs">
                <Circle className="size-3.5 text-muted-foreground" />
                {t(($) => $.product_tour.visual.backlog_waits)}
              </div>
              <div className="flex items-center gap-2 text-xs font-medium">
                <Play className="size-3.5 text-amber-600" />
                {t(($) => $.product_tour.visual.todo_starts)}
              </div>
            </div>
          </div>
          <div className="divide-y">
            <ActivityRow
              icon={<Play className="size-3.5 text-amber-600" />}
              title={t(($) => $.product_tour.visual.activity_started)}
              meta={t(($) => $.product_tour.visual.just_now)}
            />
            <ActivityRow
              icon={<Bot className="size-3.5 text-cyan-600" />}
              title={t(($) => $.product_tour.visual.activity_agent)}
              meta={t(($) => $.product_tour.visual.running)}
            />
            <ActivityRow
              icon={<MessageSquare className="size-3.5 text-emerald-600" />}
              title={t(($) => $.product_tour.visual.activity_result)}
              meta={t(($) => $.product_tour.visual.activity_feed)}
            />
          </div>
        </div>
      </div>
    </VisualStage>
  );
}

function ActivityRow({
  icon,
  title,
  meta,
}: {
  icon: React.ReactNode;
  title: string;
  meta: string;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted">
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm">{title}</span>
      <span className="shrink-0 text-[11px] text-muted-foreground">
        {meta}
      </span>
    </div>
  );
}

function HumanAdvisorVisual() {
  const { t } = useT("workspace");

  return (
    <VisualStage>
      <div className="grid w-full max-w-2xl gap-3 md:grid-cols-[0.8fr_1.2fr]">
        <div className="overflow-hidden rounded-lg border bg-background shadow-sm">
          <div className="flex items-center gap-2 border-b px-4 py-3">
            <Inbox className="size-4 text-cyan-600" />
            <span className="text-sm font-semibold">
              {t(($) => $.product_tour.visual.action_center)}
            </span>
            <span className="ml-auto size-2 rounded-full bg-red-500" />
          </div>
          <div className="border-l-4 border-l-amber-400 bg-amber-400/5 px-4 py-4">
            <p className="text-xs text-muted-foreground">
              {t(($) => $.product_tour.visual.assigned_to_you)}
            </p>
            <p className="mt-1 text-sm font-medium leading-5">
              {t(($) => $.product_tour.visual.human_task)}
            </p>
            <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
              <span className="flex size-6 items-center justify-center rounded-full bg-muted">
                <User className="size-3" />
              </span>
              {t(($) => $.product_tour.visual.you)}
            </div>
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border bg-background shadow-sm">
          <div className="flex items-center gap-2 border-b px-4 py-3">
            <MessageSquare className="size-4 text-emerald-600" />
            <span className="text-sm font-semibold">
              {t(($) => $.product_tour.visual.agent_advice)}
            </span>
          </div>
          <div className="space-y-3 p-4">
            <AdvisorComment
              color="bg-emerald-500"
              name={t(($) => $.product_tour.visual.research_agent)}
              body={t(($) => $.product_tour.visual.advice_1)}
            />
            <AdvisorComment
              color="bg-cyan-500"
              name={t(($) => $.product_tour.visual.product_agent)}
              body={t(($) => $.product_tour.visual.advice_2)}
            />
            <div className="flex items-center gap-2 border-t pt-3 text-xs font-medium text-foreground/80">
              <User className="size-3.5" />
              {t(($) => $.product_tour.visual.human_decides)}
            </div>
          </div>
        </div>
      </div>
    </VisualStage>
  );
}

function AdvisorComment({
  color,
  name,
  body,
}: {
  color: string;
  name: string;
  body: string;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <span
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-full text-white",
          color,
        )}
      >
        <Bot className="size-3.5" />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-medium">{name}</p>
        <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
          {body}
        </p>
      </div>
    </div>
  );
}

function RuntimeVisual() {
  const { t } = useT("workspace");
  const agents = [
    {
      name: t(($) => $.product_tour.visual.product_agent),
      icon: <ListTodo className="size-4" />,
      color: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    },
    {
      name: t(($) => $.product_tour.visual.growth_agent),
      icon: <Sparkles className="size-4" />,
      color: "bg-amber-400/20 text-amber-700 dark:text-amber-300",
    },
    {
      name: t(($) => $.product_tour.visual.research_agent),
      icon: <MessageSquare className="size-4" />,
      color: "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300",
    },
  ];

  return (
    <VisualStage>
      <div className="w-full max-w-2xl">
        <div className="flex items-center gap-3 rounded-lg border bg-background px-4 py-3 shadow-sm">
          <span className="flex size-9 items-center justify-center rounded-md bg-foreground text-background">
            <Server className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">
              {t(($) => $.product_tour.visual.runtime_name)}
            </p>
            <p className="text-xs text-muted-foreground">
              {t(($) => $.product_tour.visual.runtime_description)}
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
            <span className="size-2 rounded-full bg-emerald-500" />
            {t(($) => $.product_tour.visual.online)}
          </span>
        </div>

        <div className="mx-auto h-6 w-px bg-border" />

        <div className="grid gap-2.5 sm:grid-cols-3">
          {agents.map((agent) => (
            <div
              key={agent.name}
              className="rounded-lg border bg-background p-3 shadow-sm"
            >
              <span
                className={cn(
                  "flex size-8 items-center justify-center rounded-md",
                  agent.color,
                )}
              >
                {agent.icon}
              </span>
              <p className="mt-3 truncate text-sm font-medium">{agent.name}</p>
              <p className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Bot className="size-3" />
                {t(($) => $.product_tour.visual.virtual_member)}
              </p>
            </div>
          ))}
        </div>

        <div className="mx-auto h-6 w-px bg-border" />
        <div className="mx-auto flex w-fit items-center gap-2 rounded-lg border bg-background px-4 py-2.5 shadow-sm">
          <Network className="size-4 text-cyan-600" />
          <span className="text-sm font-medium">
            {t(($) => $.product_tour.visual.squad)}
          </span>
          <span className="text-xs text-muted-foreground">
            {t(($) => $.product_tour.visual.squad_summary)}
          </span>
        </div>
      </div>
    </VisualStage>
  );
}
