import {
  Activity,
  FileText,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

import { CitationsAreaChart } from "@/components/charts/citations-area-chart";
import { ProvidersBarChart } from "@/components/charts/providers-bar-chart";
import { ShareDonutChart } from "@/components/charts/share-donut-chart";
import { CitedPages } from "@/components/cited-pages";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getDashboardData } from "@/lib/dashboard-data";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const data = await getDashboardData();

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-8 px-6 py-12">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-3">
          <h1 className="text-4xl font-semibold tracking-tight">
            Agent Analytics
          </h1>
          <p className="max-w-2xl text-muted-foreground">
            Citations from ChatGPT, Claude, Perplexity, Gemini, and Copilot over
            the last 7 days.
          </p>
        </div>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          icon={<Activity className="size-4" />}
          label="Total citations (7d)"
          value={data.total.toLocaleString()}
          delta={data.delta}
        />
        <StatCard
          icon={<Sparkles className="size-4" />}
          label="Top provider"
          value={data.topProvider?.label ?? "—"}
          hint={
            data.topProvider
              ? `${data.topProvider.count.toLocaleString()} citations`
              : "No data yet"
          }
        />
        <StatCard
          icon={<FileText className="size-4" />}
          label="Cited pages"
          value={data.uniquePaths.toLocaleString()}
          hint="Unique paths"
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Citations over time</CardTitle>
            <CardDescription>
              Daily citations, stacked by provider
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CitationsAreaChart data={data.series} providers={data.providers} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Share by provider</CardTitle>
            <CardDescription>Last 7 days</CardDescription>
          </CardHeader>
          <CardContent>
            {data.providers.length ? (
              <ShareDonutChart data={data.providers} />
            ) : (
              <EmptyState />
            )}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Citations by provider</CardTitle>
            <CardDescription>Ranked by volume</CardDescription>
          </CardHeader>
          <CardContent>
            {data.providers.length ? (
              <ProvidersBarChart data={data.providers} />
            ) : (
              <EmptyState />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top cited pages</CardTitle>
            <CardDescription>Hover a path to see which agents cite it</CardDescription>
          </CardHeader>
          <CardContent>
            {data.paths.length ? (
              <CitedPages paths={data.paths} />
            ) : (
              <EmptyState />
            )}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Accept headers</CardTitle>
            <CardDescription>
              Most common Accept headers and who sends them
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {data.acceptHeaders.length ? (
              data.acceptHeaders.map((row) => (
                <div key={row.accept} className="space-y-2">
                  <div className="flex items-center justify-between gap-4 text-sm">
                    <span className="truncate font-mono text-muted-foreground">
                      {row.accept}
                    </span>
                    <span className="font-medium tabular-nums">
                      {row.total.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {row.providers.map((provider) => (
                      <span
                        key={provider.provider}
                        className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs"
                      >
                        <span
                          className="size-1.5 rounded-full"
                          style={{ backgroundColor: provider.color }}
                        />
                        {provider.label}
                        <span className="tabular-nums text-muted-foreground">
                          {provider.count.toLocaleString()}
                        </span>
                      </span>
                    ))}
                  </div>
                </div>
              ))
            ) : (
              <div className="flex h-[220px] items-center justify-center text-center text-sm text-muted-foreground">
                No Accept headers recorded yet.
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </main>
  );
}

function StatCard({
  icon,
  label,
  value,
  hint,
  delta,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  delta?: number | null;
}) {
  const up = (delta ?? 0) >= 0;

  return (
    <Card className="gap-0 py-5">
      <CardContent className="space-y-2">
        <div className="flex items-center justify-between text-muted-foreground">
          <span className="text-sm">{label}</span>
          {icon}
        </div>
        <p className="text-2xl font-semibold tracking-tight">{value}</p>
        {delta != null ? (
          <span
            className={`inline-flex items-center gap-1 text-xs font-medium ${
              up ? "text-emerald-400" : "text-red-400"
            }`}
          >
            {up ? (
              <TrendingUp className="size-3" />
            ) : (
              <TrendingDown className="size-3" />
            )}
            {up ? "+" : ""}
            {delta.toFixed(1)}% vs prev. 7d
          </span>
        ) : hint ? (
          <p className="text-xs text-muted-foreground">{hint}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function EmptyState() {
  return (
    <div className="flex h-[220px] items-center justify-center text-center text-sm text-muted-foreground">
      No citation data yet. Connect Upstash Redis to load live analytics.
    </div>
  );
}
