"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowLeft,
  CheckCircle2,
  CircleDot,
  Clock3,
  MessageSquarePlus,
  RefreshCw,
  Shield,
  Signal,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { createClient } from "@supabase/supabase-js";

type TicketStatus = "Backlog" | "Selected" | "In Progress" | "Done" | string;

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

const BOARD_COLUMNS = ["Backlog", "Selected", "In Progress", "Done"] as const;
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
  if (lower.includes("done") || lower.includes("active")) return "text-emerald-300 bg-emerald-400/10 border-emerald-400/20";
  if (lower.includes("progress") || lower.includes("selected")) return "text-cyan-300 bg-cyan-400/10 border-cyan-400/20";
  if (lower.includes("blocked")) return "text-rose-300 bg-rose-400/10 border-rose-400/20";
  return "text-white/55 bg-white/[0.05] border-white/10";
}

function priorityTone(priority: string | null) {
  const lower = priority?.toLowerCase() ?? "";
  if (lower === "critical") return "border-rose-400/30 bg-rose-400/10 text-rose-200";
  if (lower === "high") return "border-pink-400/30 bg-pink-400/10 text-pink-200";
  if (lower === "medium") return "border-cyan-400/25 bg-cyan-400/10 text-cyan-200";
  return "border-white/10 bg-white/[0.05] text-white/55";
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

  const totals = useMemo(() => {
    const open = tickets.filter((ticket) => ticket.status !== "Done").length;
    const done = tickets.filter((ticket) => ticket.status === "Done").length;
    const high = tickets.filter((ticket) => ["Critical", "High"].includes(ticket.priority ?? "") && ticket.status !== "Done").length;
    return { open, done, high };
  }, [tickets]);

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

  useEffect(() => {
    loadBoard();
  }, []);

  return (
    <div className="min-h-screen bg-[#08080D] pb-10">
      <header className="sticky top-0 z-40 border-b border-white/[0.08] bg-[#08080D]/94 px-4 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <Button asChild variant="ghost" size="icon" className="rounded-full border border-white/10 bg-white/[0.04] text-white/70 hover:bg-white/[0.08] hover:text-white">
              <Link href="/profile" aria-label="Back to profile">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/40">
                  Admin
                </p>
                <Badge className="border-cyan-400/25 bg-cyan-400/10 text-cyan-200">
                  Live
                </Badge>
              </div>
              <h1 className="mt-1 truncate text-2xl font-extrabold tracking-tight text-white">
                Agent Board
              </h1>
            </div>
          </div>

          <Button
            onClick={loadBoard}
            disabled={loadState === "loading"}
            className="rounded-full border border-white/10 bg-white/[0.06] px-3 text-white hover:bg-white/[0.1]"
          >
            <RefreshCw className={cn("h-4 w-4", loadState === "loading" && "animate-spin")} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-5">
        {error && (
          <div className="mb-4 rounded-2xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
            {error}
          </div>
        )}

        <section className="grid gap-3 sm:grid-cols-3">
          <MetricCard label="Open tickets" value={totals.open} icon={CircleDot} tone="cyan" />
          <MetricCard label="High priority" value={totals.high} icon={Activity} tone="pink" />
          <MetricCard label="Done" value={totals.done} icon={CheckCircle2} tone="emerald" />
        </section>

        <section className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="min-w-0 space-y-4">
            <AgentStrip agents={agents} />

            <div className="grid gap-3 xl:grid-cols-4">
              {BOARD_COLUMNS.map((column) => {
                const columnTickets = tickets.filter((ticket) => ticket.status === column);

                return (
                  <section key={column} className="min-w-0 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-3">
                    <div className="mb-3 flex items-center justify-between">
                      <h2 className="text-sm font-bold text-white">{column}</h2>
                      <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-xs font-semibold text-white/45">
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
                          />
                        ))
                      ) : (
                        <div className="rounded-xl border border-dashed border-white/10 px-3 py-6 text-center text-xs text-white/35">
                          No tickets
                        </div>
                      )}
                    </div>
                  </section>
                );
              })}
            </div>
          </div>

          <aside className="lg:sticky lg:top-24 lg:self-start">
            <TicketDrawer
              ticket={selectedTicket}
              comments={selectedTicket ? commentsByTicket[selectedTicket.id] ?? [] : []}
              draftComment={draftComment}
              setDraftComment={setDraftComment}
              addComment={addComment}
              posting={posting}
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
    cyan: "text-cyan-200 bg-cyan-400/10 border-cyan-400/20",
    pink: "text-pink-200 bg-pink-400/10 border-pink-400/20",
    emerald: "text-emerald-200 bg-emerald-400/10 border-emerald-400/20",
  };

  return (
    <Card className="border-white/[0.08] bg-white/[0.04]">
      <CardContent className="flex items-center justify-between p-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/35">{label}</p>
          <p className="mt-1 text-3xl font-extrabold text-white">{value}</p>
        </div>
        <div className={cn("rounded-2xl border p-3", tones[tone])}>
          <Icon className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
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

function AgentStrip({ agents }: { agents: AgentBoardAgent[] }) {
  return (
    <section className="rounded-2xl border border-white/[0.08] bg-white/[0.035] p-3">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Signal className="h-4 w-4 text-cyan-300" />
          <h2 className="text-sm font-bold text-white">Agent presence</h2>
        </div>
        <span className="text-xs text-white/35">{agents.length} linked</span>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {agents.map((agent) => (
          <div key={agent.id} className="rounded-xl border border-white/[0.08] bg-black/20 p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white">{agent.name}</p>
                <p className="mt-0.5 truncate text-xs text-white/35">{agent.model ?? "No model"}</p>
              </div>
              <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", agent.status?.toLowerCase().includes("active") ? "bg-emerald-300" : "bg-cyan-300")} />
            </div>
            <div className={cn("mt-3 rounded-full border px-2 py-1 text-[11px] font-semibold", statusTone(agent.status))}>
              {agent.status ?? "Unknown"}
            </div>
          </div>
        ))}
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
}: {
  ticket: AgentBoardTicket;
  active: boolean;
  commentCount: number;
  latestComment?: AgentBoardComment;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "w-full rounded-xl border bg-[#101018] p-3 text-left transition-all hover:border-cyan-400/30 hover:bg-white/[0.06]",
        active ? "border-cyan-400/40 shadow-[0_0_0_1px_rgba(0,245,212,0.18)]" : "border-white/[0.08]",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-[11px] font-bold text-white/45">{ticket.id}</span>
        <Badge className={cn("border text-[10px]", priorityTone(ticket.priority))}>
          {ticket.priority ?? "Normal"}
        </Badge>
      </div>

      <h3 className="mt-2 line-clamp-2 text-sm font-bold leading-snug text-white">
        {ticket.title}
      </h3>

      <div className="mt-3 flex items-center justify-between gap-2 text-[11px] text-white/40">
        <span className="truncate">{ticket.agent_id ?? ticket.assignee ?? "unassigned"}</span>
        <span className="shrink-0">{ticket.points ?? 0} pts</span>
      </div>

      {latestComment && (
        <p className="mt-2 line-clamp-2 rounded-lg bg-white/[0.04] px-2 py-1.5 text-xs leading-relaxed text-white/45">
          {latestComment.body}
        </p>
      )}

      <div className="mt-3 flex items-center justify-between text-[11px] text-white/35">
        <span className="inline-flex items-center gap-1">
          <Clock3 className="h-3 w-3" />
          {shortDate(ticket.due_date)}
        </span>
        <span>{commentCount} comments</span>
      </div>
    </button>
  );
}

function TicketDrawer({
  ticket,
  comments,
  draftComment,
  setDraftComment,
  addComment,
  posting,
}: {
  ticket: AgentBoardTicket | null;
  comments: AgentBoardComment[];
  draftComment: string;
  setDraftComment: (value: string) => void;
  addComment: () => void;
  posting: boolean;
}) {
  if (!ticket) {
    return (
      <Card className="border-white/[0.08] bg-white/[0.04]">
        <CardContent className="p-5 text-sm text-white/45">Select a ticket to inspect agent updates.</CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden border-white/[0.08] bg-[#101018]">
      <CardContent className="space-y-4 p-4">
        <div>
          <div className="flex items-center justify-between gap-2">
            <Badge className={cn("border text-xs", statusTone(ticket.status))}>{ticket.status}</Badge>
            <span className="text-xs text-white/35">{ticket.id}</span>
          </div>
          <h2 className="mt-3 text-xl font-extrabold leading-tight text-white">{ticket.title}</h2>
          <p className="mt-2 text-sm leading-relaxed text-white/45">{ticket.description ?? "No description."}</p>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <InfoPill label="Owner" value={ticket.agent_id ?? ticket.assignee ?? "Unassigned"} />
          <InfoPill label="Updated" value={shortTime(ticket.updated_at)} />
          <InfoPill label="Priority" value={ticket.priority ?? "Normal"} />
          <InfoPill label="Due" value={shortDate(ticket.due_date)} />
        </div>

        <div className="rounded-2xl border border-white/[0.08] bg-black/20 p-3">
          <div className="mb-2 flex items-center gap-2">
            <MessageSquarePlus className="h-4 w-4 text-cyan-300" />
            <h3 className="text-sm font-bold text-white">Leave update</h3>
          </div>
          <Textarea
            value={draftComment}
            onChange={(event) => setDraftComment(event.target.value)}
            placeholder="Post an agent update for this ticket..."
            className="min-h-[92px] resize-none border-white/10 bg-white/[0.05] text-sm text-white placeholder:text-white/25"
          />
          <Button
            onClick={addComment}
            disabled={posting || !draftComment.trim()}
            className="mt-3 w-full rounded-xl bg-cyan-400 text-black hover:bg-cyan-300"
          >
            <Shield className="h-4 w-4" />
            {posting ? "Posting" : "Post as Codex"}
          </Button>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-bold text-white">Latest comments</h3>
            <span className="text-xs text-white/35">{comments.length}</span>
          </div>
          <div className="max-h-[440px] space-y-2 overflow-auto pr-1">
            {comments.length ? comments.map((comment) => (
              <article key={comment.id} className="rounded-xl border border-white/[0.08] bg-white/[0.035] p-3">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="truncate text-xs font-bold text-cyan-200">{comment.agent_id}</span>
                  <span className="shrink-0 text-[11px] text-white/30">{shortTime(comment.created_at)}</span>
                </div>
                <p className="text-xs leading-relaxed text-white/55">{comment.body}</p>
              </article>
            )) : (
              <div className="rounded-xl border border-dashed border-white/10 px-3 py-8 text-center text-xs text-white/35">
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
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.035] p-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/30">{label}</p>
      <p className="mt-1 truncate font-semibold text-white/70">{value}</p>
    </div>
  );
}

function BoardSkeleton() {
  return (
    <>
      {Array.from({ length: 3 }).map((_, index) => (
        <div key={index} className="h-36 animate-pulse rounded-xl border border-white/[0.08] bg-white/[0.04]" />
      ))}
    </>
  );
}
