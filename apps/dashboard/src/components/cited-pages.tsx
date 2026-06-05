"use client";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { PathStat } from "@/lib/dashboard-types";

function shortPath(path: string) {
  try {
    const url = new URL(path);
    return `${url.pathname}${url.search}`;
  } catch {
    return path;
  }
}

export function CitedPages({ paths }: { paths: PathStat[] }) {
  const maxPath = paths[0]?.count ?? 1;

  return (
    <TooltipProvider delay={120}>
      <div className="space-y-3">
        {paths.map((row) => {
          const agents = row.agents ?? [];
          return (
            <div key={row.path} className="space-y-1.5">
              <div className="flex items-center justify-between gap-4 text-sm">
                {agents.length ? (
                  <Tooltip>
                    <TooltipTrigger
                      render={<span />}
                      className="min-w-0 cursor-help truncate font-mono text-muted-foreground underline decoration-dotted decoration-muted-foreground/40 underline-offset-4"
                    >
                      {shortPath(row.path)}
                    </TooltipTrigger>
                    <TooltipContent className="min-w-40 flex-col items-stretch gap-1 px-3 py-2">
                      <span className="mb-0.5 text-[11px] font-medium opacity-70">
                        Cited by
                      </span>
                      {agents.map((agent) => (
                        <span
                          key={agent.provider}
                          className="flex items-center justify-between gap-3"
                        >
                          <span className="flex items-center gap-1.5">
                            <span
                              className="size-1.5 rounded-full"
                              style={{ backgroundColor: agent.color }}
                            />
                            {agent.label}
                          </span>
                          <span className="tabular-nums opacity-70">
                            {agent.count.toLocaleString()}
                          </span>
                        </span>
                      ))}
                    </TooltipContent>
                  </Tooltip>
                ) : (
                  <span className="min-w-0 truncate font-mono text-muted-foreground">
                    {shortPath(row.path)}
                  </span>
                )}
                <span className="font-medium tabular-nums">
                  {row.count.toLocaleString()}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${Math.max(6, (row.count / maxPath) * 100)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </TooltipProvider>
  );
}
