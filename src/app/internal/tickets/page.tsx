import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Internal Tickets | VibeCheck",
  robots: { index: false, follow: false },
};

const AGENT_BOARD_SUPABASE_URL = "https://gfsbqewkrcyclbktfyfk.supabase.co";
const AGENT_BOARD_SUPABASE_ANON_KEY = "sb_publishable_JysdJo98nqOq3piVQA6LXw_vYb3Jyv_";

type Ticket = {
  id: string;
  title: string;
  description: string | null;
  type: string | null;
  status: string | null;
  priority: string | null;
  assignee: string | null;
  agent_id: string | null;
  points: number | null;
  updated_at: string | null;
};

type Agent = {
  id: string;
  name: string;
  status: string | null;
};

type Comment = {
  ticket_id: string;
  created_at: string;
};

const STATUSES = ["Blocker", "In Progress", "Review", "Selected", "Backlog", "Done"];

async function boardFetch<T>(path: string): Promise<T[]> {
  const response = await fetch(`${AGENT_BOARD_SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: AGENT_BOARD_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${AGENT_BOARD_SUPABASE_ANON_KEY}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Agent Board fetch failed: ${response.status}`);
  }

  return response.json() as Promise<T[]>;
}

function priorityClass(priority: string | null) {
  if (priority === "Critical") return "border-red-400/40 bg-red-500/10 text-red-100";
  if (priority === "High") return "border-orange-400/40 bg-orange-500/10 text-orange-100";
  if (priority === "Medium") return "border-[#8B6CFF]/30 bg-[#8B6CFF]/10 text-[#F4F5F8]";
  return "border-white/10 bg-white/[0.04] text-white/60";
}

function timeLabel(iso: string | null) {
  if (!iso) return "No update";
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default async function InternalTicketsPage() {
  const [tickets, agents, comments] = await Promise.all([
    boardFetch<Ticket>("agent_board_tickets?select=id,title,description,type,status,priority,assignee,agent_id,points,updated_at&order=sort_order.asc"),
    boardFetch<Agent>("agent_board_agents?select=id,name,status&order=id.asc"),
    boardFetch<Comment>("agent_board_comments?select=ticket_id,created_at&order=created_at.desc&limit=1000"),
  ]);

  const commentCounts = comments.reduce<Record<string, number>>((counts, comment) => {
    counts[comment.ticket_id] = (counts[comment.ticket_id] ?? 0) + 1;
    return counts;
  }, {});

  const agentNames = new Map(agents.map((agent) => [agent.id, agent.name]));
  const activeTickets = tickets.filter((ticket) => ticket.status !== "Done");

  return (
    <main className="min-h-screen bg-[#08080D] px-4 py-6 text-white">
      <div className="mx-auto max-w-7xl">
        <header className="border-b border-white/10 pb-5">
          <p className="text-xs font-bold uppercase tracking-[0.25em] text-[#8B6CFF]/70">
            Internal Agent Work Only
          </p>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="font-display text-3xl font-black tracking-tight">Internal Tickets</h1>
              <p className="mt-2 max-w-2xl text-sm text-white/50">
                Production read-only view of Claude/Codex agent tickets, blockers, and handoffs. This is not a consumer VibeCheck feature.
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white/60">
              <strong className="text-white">{activeTickets.length}</strong> active ·{" "}
              <strong className="text-white">{tickets.length}</strong> total
            </div>
          </div>
        </header>

        <section className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {agents.slice(0, 8).map((agent) => (
            <div key={agent.id} className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
              <p className="truncate text-sm font-bold text-white">{agent.name}</p>
              <p className="mt-1 truncate text-xs text-white/40">{agent.id}</p>
              <p className="mt-2 text-xs font-semibold text-[#9CA2AE]">{agent.status ?? "Unknown"}</p>
            </div>
          ))}
        </section>

        <section className="mt-6 grid gap-4 xl:grid-cols-6">
          {STATUSES.map((status) => {
            const columnTickets = tickets.filter((ticket) => (ticket.status ?? "Backlog") === status);
            return (
              <div key={status} className="rounded-2xl border border-white/10 bg-white/[0.025] p-3">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="font-display text-sm font-black text-white">{status}</h2>
                  <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-white/50">
                    {columnTickets.length}
                  </span>
                </div>
                <div className="space-y-3">
                  {columnTickets.map((ticket) => (
                    <article key={ticket.id} className="rounded-xl border border-white/10 bg-[#11111A] p-3">
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-[11px] font-bold text-[#8B6CFF]/80">{ticket.id}</span>
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${priorityClass(ticket.priority)}`}>
                          {ticket.priority ?? "Priority"}
                        </span>
                      </div>
                      <h3 className="mt-2 line-clamp-3 text-sm font-bold leading-snug text-white">
                        {ticket.title}
                      </h3>
                      <p className="mt-3 text-[11px] text-white/45">
                        {agentNames.get(ticket.agent_id ?? "") ?? ticket.assignee ?? "Unassigned"}
                      </p>
                      <div className="mt-3 flex items-center justify-between text-[11px] text-white/35">
                        <span>{commentCounts[ticket.id] ?? 0} comments</span>
                        <span>{timeLabel(ticket.updated_at)}</span>
                      </div>
                    </article>
                  ))}
                  {columnTickets.length === 0 && (
                    <p className="rounded-xl border border-dashed border-white/10 p-4 text-center text-xs text-white/35">
                      Empty
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </section>
      </div>
    </main>
  );
}
