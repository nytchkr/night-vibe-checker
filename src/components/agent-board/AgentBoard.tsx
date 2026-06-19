"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowLeft,
  CheckCircle2,
  CircleDot,
  Clock3,
  Filter,
  MessageSquarePlus,
  PanelRightOpen,
  RefreshCw,
  Search,
  Shield,
  Signal,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { createClient } from "@supabase/supabase-js";

type TicketStatus = "Backlog" | "Selected" | "In Progress" | "Review" | "Done" | string;

type AgentBoardTicket = {
  id: string;
  title: string;
  description: string | null;
  type: string | null;
  status: TicketStatus;
  priority: string | null;
  assignee: string | null;
  agent_id: string | null;
  points: number | null;
  due_date: string | null;
  updated_at: string | null;
};

type AgentBoardComment = {
  id: string;
  ticket_id: string;
  agent_id: string;
  body: string;
  created_at: string;
};

type AgentBoardAgent = {
  id: string;
  name: string;
  model: string | null;
  status: string | null;
  scope: string | null;
  updated_at: string | null;
};

type LoadState = "idle" | "loading" | "ready" | "error";

const BOARD_COLUMNS = ["Backlog", "Selected", "In Progress", "Review", "Done"] as const;
const ADMIN_AGENT_ID = "codex";

const agentBoardUrl =
  process.env.NEXT_PUBLIC_AGENT_BOARD_SUPABASE_URL ??
  process.env.NEXT_PUBLIC_SUPABASE_URL;
const agentBoardAnonKey =
  process.env.NEXT_PUBLIC_AGENT_BOARD_SUPABASE_ANON_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function createAgentBoardClient() {
  if (!agentBoardUrl || !agentBoardAnonKey) {
    throw new Error("Missing Agent Board Supabase environment variables.");
  }

  return createClient(agentBoardUrl, agentBoardAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function shortDate(value: string | null) {
  if (!value) return "No date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No date";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function shortTime(value: string | null) {
  if (!value) return "No update";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No update";
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function statusTone(status: string | null) {
  const lower = status?.toLowerCase() ?? "";
  if (lower.includes("done") || lower.includes("active")) return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (lower.includes("review")) return "border-violet-200 bg-violet-50 text-violet-700";
  if (lower.includes("progress")) return "border-amber-200 bg-amber-50 text-amber-700";
  if (lower.includes("selected")) return "border-blue-200 bg-blue-50 text-blue-700";
  if (lower.includes("blocked")) return "border-rose-200 bg-rose-50 text-rose-700";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

function priorityTone(priority: string | null) {
  const lower = priority?.toLowerCase() ?? "";
  if (lower === "critical") return "border-rose-200 bg-rose-50 text-rose-700";
  if (lower === "high") return "border-orange-200 bg-orange-50 text-orange-700";
  if (lower === "medium") return "border-blue-200 bg-blue-50 text-blue-700";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

function typeTone(type: string | null) {
  const lower = type?.toLowerCase() ?? "";
  if (lower === "bug") return "border-red-200 bg-red-50 text-red-700";
  if (lower === "epic") return "border-purple-200 bg-purple-50 text-purple-700";
  if (lower === "story") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function columnAccent(status: string) {
  if (status === "Backlog") return "border-t-slate-400";
  if (status === "Selected") return "border-t-blue-500";
  if (status === "In Progress") return "border-t-amber-500";
  if (status === "Review") return "border-t-violet-500";
  return "border-t-emerald-500";
}

function makeCommentId(ticketId: string) {
  return `${ticketId}-${ADMIN_AGENT_ID}-${new Date().toISOString().replace(/[:.]/g, "-")}`;
}

export default function AgentBoard() {
  const [tickets, setTickets] = useState<AgentBoardTicket[]>([]);
  const [comments, setComments] = useState<AgentBoardComment[]>([]);
  const [agents, setAgents] = useState<AgentBoardAgent[]>([]);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [draftComment, setDraftComment] = useState("");
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [draggingTicketId, setDraggingTicketId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [agentFilter, setAgentFilter] = useState("all");

  const selectedTicket = useMemo(
    () => tickets.find((ticket) => ticket.id === selectedTicketId) ?? tickets[0] ?? null,
    [selectedTicketId, tickets],
  );

  const commentsByTicket = useMemo(() => {
    return comments.reduce<Record<string, AgentBoardComment[]>>((acc, comment) => {
      acc[comment.ticket_id] = acc[comment.ticket_id] || [];
      acc[comment.ticket_id].push(comment);
      return acc;
    }, {});
  }, [comments]);

  const filteredTickets = useMemo(() => {
    const query = search.trim().toLowerCase();
    return tickets.filter((ticket) => {
      const matchesQuery = !query ||
        ticket.id.toLowerCase().includes(query) ||
        ticket.title.toLowerCase().includes(query) ||
        (ticket.description ?? "").toLowerCase().includes(query);
      const matchesType = typeFilter === "all" || ticket.type === typeFilter;
      const matchesPriority = priorityFilter === "all" || ticket.priority === priorityFilter;
      const matchesAgent = agentFilter === "all" || ticket.agent_id === agentFilter;
      return matchesQuery && matchesType && matchesPriority && matchesAgent;
    });
  }, [agentFilter, priorityFilter, search, tickets, typeFilter]);

  const totals = useMemo(() => {
    const open = filteredTickets.filter((ticket) => ticket.status !== "Done").length;
    const done = filteredTickets.filter((ticket) => ticket.status === "Done").length;
    const high = filteredTickets.filter((ticket) => ["Critical", "High"].includes(ticket.priority ?? "") && ticket.status !== "Done").length;
    return { open, done, high };
  }, [filteredTickets]);

  const filterOptions = useMemo(() => {
    return {
      types: Array.from(new Set(tickets.map((ticket) => ticket.type).filter(Boolean))) as string[],
      priorities: Array.from(new Set(tickets.map((ticket) => ticket.priority).filter(Boolean))) as string[],
      agents: agents.filter((agent) => agent.id !== "unassigned"),
    };
  }, [agents, tickets]);

  async function loadBoard() {
    setLoadState("loading");
    setError(null);

    try {
      const supabase = createAgentBoardClient();
      const [ticketResult, commentResult, agentResult] = await Promise.all([
        supabase.from("agent_board_tickets").select("*").order("id", { ascending: true }),
        supabase.from("agent_board_comments").select("*").order("created_at", { ascending: false }).limit(160),
        supabase.from("agent_board_agents").select("*").order("id", { ascending: true }),
      ]);

      if (ticketResult.error) throw ticketResult.error;
      if (commentResult.error) throw commentResult.error;
      if (agentResult.error) throw agentResult.error;

      const nextTickets = (ticketResult.data ?? []) as AgentBoardTicket[];
      setTickets(nextTickets);
      setComments((commentResult.data ?? []) as AgentBoardComment[]);
      setAgents((agentResult.data ?? []) as AgentBoardAgent[]);
      setSelectedTicketId((current) => current ?? nextTickets.find((ticket) => ticket.status !== "Done")?.id ?? nextTickets[0]?.id ?? null);
      setLoadState("ready");
    } catch (err) {
      setError(formatError(err, "Unable to load Agent Board."));
      setLoadState("error");
    }
  }

  async function addComment() {
    if (!selectedTicket || !draftComment.trim()) return;

    setPosting(true);
    setError(null);

    const nextComment: AgentBoardComment = {
      id: makeCommentId(selectedTicket.id),
      ticket_id: selectedTicket.id,
      agent_id: ADMIN_AGENT_ID,
      body: draftComment.trim(),
      created_at: new Date().toISOString(),
    };

    try {
      const supabase = createAgentBoardClient();
      const { error: insertError } = await supabase
        .from("agent_board_comments")
        .insert(nextComment);

      if (insertError) throw insertError;

      setDraftComment("");
      setComments((current) => [nextComment, ...current]);
    } catch (err) {
      setError(formatError(err, "Unable to post comment."));
    } finally {
      setPosting(false);
    }
  }

  async function updateTicketStatus(ticket: AgentBoardTicket, nextStatus: TicketStatus) {
    if (!ticket || ticket.status === nextStatus) return;
    const previousStatus = ticket.status;
    setStatusUpdating(true);
    setError(null);
    setTickets((current) =>
      current.map((item) =>
        item.id === ticket.id ? { ...item, status: nextStatus, updated_at: new Date().toISOString() } : item,
      ),
    );

    const nextComment: AgentBoardComment = {
      id: makeCommentId(ticket.id),
      ticket_id: ticket.id,
      agent_id: ticket.agent_id ?? ADMIN_AGENT_ID,
      body: `Status moved from ${previousStatus} to ${nextStatus}.`,
      created_at: new Date().toISOString(),
    };

    try {
      const supabase = createAgentBoardClient();
      const [{ error: updateError }, { error: commentError }] = await Promise.all([
        supabase
          .from("agent_board_tickets")
          .update({ status: nextStatus, updated_at: new Date().toISOString() })
          .eq("id", ticket.id),
        supabase.from("agent_board_comments").insert(nextComment),
      ]);

      if (updateError) throw updateError;
      if (commentError) throw commentError;
      setComments((current) => [nextComment, ...current]);
    } catch (err) {
      setTickets((current) =>
        current.map((item) =>
          item.id === ticket.id ? { ...item, status: previousStatus } : item,
        ),
      );
      setError(formatError(err, "Unable to update ticket status."));
    } finally {
      setStatusUpdating(false);
    }
  }

  useEffect(() => {
    loadBoard();
  }, []);

  return (
    <div className="min-h-screen bg-slate-100 pb-10 text-slate-900">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 px-4 shadow-sm backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <Button asChild variant="ghost" size="icon" className="rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900">
              <Link href="/profile" aria-label="Back to profile">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Night Vibe Ops
                </p>
                <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700">
                  Supabase live
                </Badge>
              </div>
              <h1 className="mt-1 truncate text-2xl font-extrabold tracking-tight text-slate-950">
                Agent Board
              </h1>
            </div>
          </div>

          <Button
            onClick={loadBoard}
            disabled={loadState === "loading"}
            className="rounded-lg border border-slate-200 bg-white px-3 text-slate-700 shadow-sm hover:bg-slate-50"
          >
            <RefreshCw className={cn("h-4 w-4", loadState === "loading" && "animate-spin")} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-[1800px] px-4 py-5">
        {error && (
          <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        )}

        <section className="grid gap-3 sm:grid-cols-3">
          <MetricCard label="Open tickets" value={totals.open} icon={CircleDot} tone="cyan" />
          <MetricCard label="High priority" value={totals.high} icon={Activity} tone="pink" />
          <MetricCard label="Done" value={totals.done} icon={CheckCircle2} tone="emerald" />
        </section>

        <section className="mt-4 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
          <div className="grid gap-3 lg:grid-cols-[minmax(260px,1fr)_160px_160px_220px]">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search tickets, descriptions, IDs"
                className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </label>
            <FilterSelect label="Type" value={typeFilter} onChange={setTypeFilter} options={filterOptions.types} />
            <FilterSelect label="Priority" value={priorityFilter} onChange={setPriorityFilter} options={filterOptions.priorities} />
            <FilterSelect
              label="Agent"
              value={agentFilter}
              onChange={setAgentFilter}
              options={filterOptions.agents.map((agent) => agent.id)}
            />
          </div>
        </section>

        <section className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_400px]">
          <div className="min-w-0 space-y-4">
            <AgentStrip agents={agents} tickets={tickets} />

            <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white p-2 shadow-sm">
              <div className="flex flex-col gap-3 pb-1 md:min-w-max md:flex-row">
              {BOARD_COLUMNS.map((column) => {
                const columnTickets = filteredTickets.filter((ticket) => ticket.status === column);

                return (
                  <section
                    key={column}
                    onDragOver={(event) => {
                      if (!draggingTicketId) return;
                      event.preventDefault();
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      const ticket = tickets.find((item) => item.id === draggingTicketId);
                      if (ticket) void updateTicketStatus(ticket, column);
                      setDraggingTicketId(null);
                    }}
                    className={cn("w-full shrink-0 rounded-lg border border-t-4 border-slate-200 bg-slate-50 p-2 md:w-[280px]", columnAccent(column))}
                  >
                    <div className="mb-3 flex items-center justify-between">
                      <h2 className="text-sm font-bold text-slate-800">{column}</h2>
                      <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-slate-500 ring-1 ring-slate-200">
                        {columnTickets.length}
                      </span>
                    </div>

                    <div className="space-y-2">
                      {loadState === "loading" && tickets.length === 0 ? (
                        <BoardSkeleton />
                      ) : columnTickets.length ? (
                        columnTickets.map((ticket) => (
                          <TicketCard
                            key={ticket.id}
                            ticket={ticket}
                            active={ticket.id === selectedTicket?.id}
                            commentCount={commentsByTicket[ticket.id]?.length ?? 0}
                            latestComment={commentsByTicket[ticket.id]?.[0]}
                            onSelect={() => setSelectedTicketId(ticket.id)}
                            onDragStart={() => setDraggingTicketId(ticket.id)}
                            onDragEnd={() => setDraggingTicketId(null)}
                          />
                        ))
                      ) : (
                        <div className="rounded-lg border border-dashed border-slate-300 bg-white/70 px-3 py-6 text-center text-xs text-slate-400">
                          No tickets
                        </div>
                      )}
                    </div>
                  </section>
                );
              })}
              </div>
            </div>
          </div>

          <aside className="lg:sticky lg:top-24 lg:self-start" aria-label="Ticket details">
            <TicketDrawer
              ticket={selectedTicket}
              comments={selectedTicket ? commentsByTicket[selectedTicket.id] ?? [] : []}
              draftComment={draftComment}
              setDraftComment={setDraftComment}
              addComment={addComment}
              posting={posting}
              statusUpdating={statusUpdating}
              updateTicketStatus={updateTicketStatus}
            />
          </aside>
        </section>
      </main>
    </div>
  );
}

function MetricCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  icon: typeof Activity;
  tone: "cyan" | "pink" | "emerald";
}) {
  const tones = {
    cyan: "text-blue-700 bg-blue-50 border-blue-200",
    pink: "text-orange-700 bg-orange-50 border-orange-200",
    emerald: "text-emerald-700 bg-emerald-50 border-emerald-200",
  };

  return (
    <Card className="rounded-lg border-slate-200 bg-white shadow-sm">
      <CardContent className="flex items-center justify-between p-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</p>
          <p className="mt-1 text-3xl font-extrabold text-slate-950">{value}</p>
        </div>
        <div className={cn("rounded-lg border p-3", tones[tone])}>
          <Icon className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3">
      <Filter className="h-4 w-4 text-slate-400" />
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-w-0 flex-1 bg-transparent text-sm font-medium text-slate-700 outline-none"
      >
        <option value="all">All {label}</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function formatError(err: unknown, fallback: string) {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) {
    const message = (err as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return fallback;
}

function AgentStrip({ agents, tickets }: { agents: AgentBoardAgent[]; tickets: AgentBoardTicket[] }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Signal className="h-4 w-4 text-blue-600" />
          <h2 className="text-sm font-bold text-slate-900">Agent presence</h2>
        </div>
        <span className="text-xs font-medium text-slate-500">{agents.length} linked</span>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {agents.map((agent) => {
          const openCount = tickets.filter((ticket) => ticket.agent_id === agent.id && ticket.status !== "Done").length;
          return (
          <div key={agent.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900">{agent.name}</p>
                <p className="mt-0.5 truncate text-xs text-slate-500">{agent.model ?? "No model"}</p>
              </div>
              <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full shadow-[0_0_0_3px_rgba(16,185,129,0.14)]", agent.status?.toLowerCase().includes("active") ? "bg-emerald-500" : "bg-slate-400")} />
            </div>
            <div className="mt-3 flex items-center justify-between gap-2">
              <div className={cn("rounded-full border px-2 py-1 text-[11px] font-semibold", statusTone(agent.status))}>
                {agent.status ?? "Unknown"}
              </div>
              <span className="rounded-full bg-white px-2 py-1 text-[11px] font-bold text-slate-500 ring-1 ring-slate-200">
                {openCount} open
              </span>
            </div>
          </div>
        )})}
      </div>
    </section>
  );
}

function TicketCard({
  ticket,
  active,
  commentCount,
  latestComment,
  onSelect,
  onDragStart,
  onDragEnd,
}: {
  ticket: AgentBoardTicket;
  active: boolean;
  commentCount: number;
  latestComment?: AgentBoardComment;
  onSelect: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  return (
    <article
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={cn(
        "group w-full cursor-pointer rounded-lg border bg-white p-3 text-left shadow-sm transition-all hover:border-blue-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-200 active:cursor-grabbing",
        active ? "border-blue-400 shadow-[0_0_0_2px_rgba(37,99,235,0.12)]" : "border-slate-200",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-[11px] font-bold text-slate-500">{ticket.id}</span>
        <Badge className={cn("border text-[10px]", priorityTone(ticket.priority))}>
          {ticket.priority ?? "Normal"}
        </Badge>
      </div>

      <h3 className="mt-2 line-clamp-2 text-sm font-bold leading-snug text-slate-950">
        {ticket.title}
      </h3>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <Badge className={cn("border text-[10px]", typeTone(ticket.type))}>{ticket.type ?? "Task"}</Badge>
        <Badge className={cn("border text-[10px]", statusTone(ticket.status))}>{ticket.status}</Badge>
      </div>

      {latestComment && (
        <p className="mt-2 line-clamp-2 rounded-md bg-slate-50 px-2 py-1.5 text-xs leading-relaxed text-slate-500">
          {latestComment.body}
        </p>
      )}

      <div className="mt-3 flex items-center justify-between gap-2 text-[11px] text-slate-500">
        <span className="truncate">{ticket.agent_id ?? ticket.assignee ?? "unassigned"}</span>
        <span className="shrink-0">{ticket.points ?? 0} pts</span>
      </div>

      <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
        <span className="inline-flex min-w-0 items-center gap-1">
          <Clock3 className="h-3 w-3" />
          {shortDate(ticket.due_date)}
        </span>
        <span className="inline-flex items-center gap-1">
          <span className={cn("rounded-full px-2 py-0.5 font-bold", commentCount ? "bg-blue-50 text-blue-700" : "bg-rose-50 text-rose-700")}>
            {commentCount}
          </span>
          <PanelRightOpen className="h-3.5 w-3.5 text-slate-300 transition-colors group-hover:text-blue-500" aria-hidden="true" />
        </span>
      </div>
    </article>
  );
}

function TicketDrawer({
  ticket,
  comments,
  draftComment,
  setDraftComment,
  addComment,
  posting,
  statusUpdating,
  updateTicketStatus,
}: {
  ticket: AgentBoardTicket | null;
  comments: AgentBoardComment[];
  draftComment: string;
  setDraftComment: (value: string) => void;
  addComment: () => void;
  posting: boolean;
  statusUpdating: boolean;
  updateTicketStatus: (ticket: AgentBoardTicket, nextStatus: TicketStatus) => Promise<void>;
}) {
  if (!ticket) {
    return (
      <Card className="rounded-lg border-slate-200 bg-white shadow-sm">
        <CardContent className="p-5 text-sm text-slate-500">Select a ticket to inspect agent updates.</CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden rounded-lg border-slate-200 bg-white shadow-sm">
      <CardContent className="space-y-4 p-4">
        <div>
          <div className="flex items-center justify-between gap-2">
            <Badge className={cn("border text-xs", statusTone(ticket.status))}>{ticket.status}</Badge>
            <span className="text-xs font-bold text-slate-500">{ticket.id}</span>
          </div>
          <h2 className="mt-3 text-xl font-extrabold leading-tight text-slate-950">{ticket.title}</h2>
          <p className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-sm leading-relaxed text-slate-600">{ticket.description ?? "No description."}</p>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <InfoPill label="Owner" value={ticket.agent_id ?? ticket.assignee ?? "Unassigned"} />
          <InfoPill label="Updated" value={shortTime(ticket.updated_at)} />
          <InfoPill label="Priority" value={ticket.priority ?? "Normal"} />
          <InfoPill label="Due" value={shortDate(ticket.due_date)} />
        </div>

        <label className="grid gap-1 text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
          Status
          <select
            value={ticket.status}
            disabled={statusUpdating}
            onChange={(event) => void updateTicketStatus(ticket, event.target.value)}
            className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm normal-case tracking-normal text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
          >
            {BOARD_COLUMNS.map((status) => (
              <option key={status} value={status}>{status}</option>
            ))}
          </select>
        </label>

        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="mb-2 flex items-center gap-2">
            <MessageSquarePlus className="h-4 w-4 text-blue-600" />
            <h3 className="text-sm font-bold text-slate-900">Leave update</h3>
          </div>
          <Textarea
            value={draftComment}
            onChange={(event) => setDraftComment(event.target.value)}
            placeholder="Post an agent update for this ticket..."
            className="min-h-[92px] resize-none border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400"
          />
          <Button
            onClick={addComment}
            disabled={posting || !draftComment.trim()}
            className="mt-3 w-full rounded-lg bg-blue-600 text-white hover:bg-blue-700"
          >
            <Shield className="h-4 w-4" />
            {posting ? "Posting" : "Post as Codex"}
          </Button>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">Latest comments</h3>
            <span className="text-xs text-slate-500">{comments.length}</span>
          </div>
          <div className="max-h-[440px] space-y-2 overflow-auto pr-1">
            {comments.length ? comments.map((comment) => (
              <article key={comment.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="truncate text-xs font-bold text-blue-700">{comment.agent_id}</span>
                  <span className="shrink-0 text-[11px] text-slate-400">{shortTime(comment.created_at)}</span>
                </div>
                <p className="whitespace-pre-wrap text-xs leading-relaxed text-slate-600">{comment.body}</p>
              </article>
            )) : (
              <div className="rounded-lg border border-dashed border-slate-300 px-3 py-8 text-center text-xs text-slate-400">
                No comments yet
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function InfoPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <p className="mt-1 truncate font-semibold text-slate-800">{value}</p>
    </div>
  );
}

function BoardSkeleton() {
  return (
    <>
      {Array.from({ length: 3 }).map((_, index) => (
        <div key={index} className="h-36 animate-pulse rounded-lg border border-slate-200 bg-white" />
      ))}
    </>
  );
}
