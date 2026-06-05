"use client";

import { Bar, BarChart, Cell, XAxis, YAxis } from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { ProviderStat } from "@/lib/dashboard-types";

export function ProvidersBarChart({ data }: { data: ProviderStat[] }) {
  const config = {
    count: { label: "Citations" },
    ...Object.fromEntries(
      data.map((row) => [row.provider, { label: row.label, color: row.color }]),
    ),
  } satisfies ChartConfig;

  return (
    <ChartContainer config={config} className="aspect-auto h-[260px] w-full">
      <BarChart
        data={data}
        layout="vertical"
        margin={{ left: 4, right: 16 }}
        barCategoryGap={12}
      >
        <YAxis
          dataKey="label"
          type="category"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          width={84}
        />
        <XAxis dataKey="count" type="number" hide />
        <ChartTooltip
          cursor={{ fill: "var(--muted)", opacity: 0.3 }}
          content={<ChartTooltipContent hideLabel />}
        />
        <Bar dataKey="count" radius={6} className="cursor-pointer">
          {data.map((row) => (
            <Cell key={row.provider} fill={row.color} />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}
