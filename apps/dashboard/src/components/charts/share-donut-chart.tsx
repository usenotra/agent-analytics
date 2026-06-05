"use client";

import { Label, Pie, PieChart, Cell } from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { ProviderStat } from "@/lib/dashboard-types";

export function ShareDonutChart({ data }: { data: ProviderStat[] }) {
  const total = data.reduce((sum, row) => sum + row.count, 0);

  const config = Object.fromEntries(
    data.map((row) => [row.provider, { label: row.label, color: row.color }]),
  ) satisfies ChartConfig;

  return (
    <ChartContainer
      config={config}
      className="mx-auto aspect-square h-[260px]"
    >
      <PieChart>
        <ChartTooltip
          cursor={false}
          content={<ChartTooltipContent nameKey="provider" hideLabel />}
        />
        <Pie
          data={data}
          dataKey="count"
          nameKey="provider"
          innerRadius={70}
          outerRadius={104}
          paddingAngle={3}
          strokeWidth={0}
          className="cursor-pointer"
        >
          {data.map((row) => (
            <Cell key={row.provider} fill={row.color} />
          ))}
          <Label
            content={({ viewBox }) => {
              if (!viewBox || !("cx" in viewBox)) return null;
              return (
                <text
                  x={viewBox.cx}
                  y={viewBox.cy}
                  textAnchor="middle"
                  dominantBaseline="middle"
                >
                  <tspan
                    x={viewBox.cx}
                    y={viewBox.cy}
                    className="fill-foreground text-3xl font-semibold tabular-nums"
                  >
                    {total.toLocaleString()}
                  </tspan>
                  <tspan
                    x={viewBox.cx}
                    y={(viewBox.cy ?? 0) + 24}
                    className="fill-muted-foreground text-xs"
                  >
                    citations
                  </tspan>
                </text>
              );
            }}
          />
        </Pie>
      </PieChart>
    </ChartContainer>
  );
}
