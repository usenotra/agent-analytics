import { DEFAULT_PREFIX, getAnalytics } from "@/lib/analytics";

const DEMO_PROVIDERS = [
  { provider: "chatgpt", count: 128 },
  { provider: "claude", count: 94 },
  { provider: "perplexity", count: 67 },
  { provider: "gemini", count: 41 },
  { provider: "copilot", count: 22 },
];

async function getProviderStats() {
  const analytics = getAnalytics();
  if (!analytics) {
    return { connected: false as const, providers: DEMO_PROVIDERS, total: DEMO_PROVIDERS.reduce((sum, row) => sum + row.count, 0) };
  }

  try {
    await analytics.query.getIndex();
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const rows = await analytics.query.aggregateBy({ since, field: "provider" });
    const providers = Object.entries(rows).map(([provider, count]) => ({
      provider,
      count,
    }));
    const total = providers.reduce((sum, row) => sum + row.count, 0);

    return { connected: true as const, providers, total };
  } catch {
    return { connected: true as const, providers: [], total: 0 };
  }
}

export default async function DashboardPage() {
  const stats = await getProviderStats();

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-8 px-6 py-12">
      <header className="space-y-3">
        <p className="text-sm font-medium uppercase tracking-widest text-indigo-400">@usenotra/agent-analytics</p>
        <h1 className="text-4xl font-semibold tracking-tight">Agent Analytics Dashboard</h1>
        <p className="max-w-2xl text-lg text-zinc-400">
          Monitor citations from ChatGPT, Claude, Perplexity, Gemini, and Copilot. This app lives in the Turborepo
          monorepo and imports the workspace SDK package directly.
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Total citations (7d)" value={stats.total.toLocaleString()} />
        <StatCard label="Redis prefix" value={DEFAULT_PREFIX} mono />
        <StatCard
          label="Data source"
          value={stats.connected ? "Upstash Redis" : "Demo data"}
          hint={stats.connected ? "Live analytics" : "Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN"}
        />
      </section>

      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-medium">Citations by provider</h2>
            <p className="text-sm text-zinc-400">Last 7 days, grouped by AI agent</p>
          </div>
          {!stats.connected && (
            <span className="rounded-full bg-indigo-500/15 px-3 py-1 text-xs font-medium text-indigo-300">
              Demo mode
            </span>
          )}
        </div>

        <div className="space-y-3">
          {stats.providers.length === 0 ? (
            <p className="text-sm text-zinc-400">No citation data yet. Connect Upstash Redis to load live analytics.</p>
          ) : (
            stats.providers.map((row) => (
              <ProviderRow key={row.provider} provider={row.provider} count={row.count} max={stats.total || 1} />
            ))
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6 text-sm text-zinc-400">
        <h2 className="mb-2 text-base font-medium text-zinc-200">Monorepo layout</h2>
        <ul className="list-inside list-disc space-y-1">
          <li>
            <code className="text-zinc-300">packages/agent-analytics</code> — SDK published as{" "}
            <code className="text-zinc-300">@usenotra/agent-analytics</code>
          </li>
          <li>
            <code className="text-zinc-300">apps/dashboard</code> — this Next.js app
          </li>
        </ul>
      </section>
    </main>
  );
}

function StatCard({
  label,
  value,
  hint,
  mono = false,
}: {
  label: string;
  value: string;
  hint?: string;
  mono?: boolean;
}) {
  return (
    <article className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
      <p className="text-sm text-zinc-400">{label}</p>
      <p className={`mt-2 text-2xl font-semibold ${mono ? "truncate font-mono text-base" : ""}`}>{value}</p>
      {hint ? <p className="mt-2 text-xs text-zinc-500">{hint}</p> : null}
    </article>
  );
}

function ProviderRow({ provider, count, max }: { provider: string; count: number; max: number }) {
  const width = Math.max(8, Math.round((count / max) * 100));

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium capitalize text-zinc-200">{provider}</span>
        <span className="text-zinc-400">{count.toLocaleString()}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-zinc-800">
        <div className="h-full rounded-full bg-indigo-500" style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}
