"use client";

import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";

import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  PROVIDER_META,
  type DailyPoint,
  type ProviderStat,
} from "@/lib/dashboard-types";

export function CitationsAreaChart({
  data,
  providers,
}: {
  data: DailyPoint[];
  providers: ProviderStat[];
}) {
  const active = providers.length
    ? providers
    : (Object.keys(PROVIDER_META) as (keyof typeof PROVIDER_META)[]).map((p) => ({
        provider: p,
        label: PROVIDER_META[p].label,
        color: PROVIDER_META[p].color,
        count: 0,
      }));

  const config = Object.fromEntries(
    active.map((row) => [row.provider, { label: row.label, color: row.color }]),
  ) satisfies ChartConfig;

  return (
    <ChartContainer config={config} className="aspect-auto h-[300px] w-full">
      <AreaChart data={data} margin={{ left: 4, right: 8, top: 8 }}>
        <defs>
          {active.map((row) => (
            <linearGradient
              key={row.provider}
              id={`fill-${row.provider}`}
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop offset="0%" stopColor={row.color} stopOpacity={0.55} />
              <stop offset="55%" stopColor={row.color} stopOpacity={0.12} />
              <stop offset="100%" stopColor={row.color} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid vertical={false} strokeDasharray="4 4" />
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={false}
          tickMargin={10}
          minTickGap={16}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={32}
          tickMargin={6}
          allowDecimals={false}
        />
        <ChartTooltip
          cursor={{ strokeDasharray: "4 4" }}
          content={<ChartTooltipContent indicator="dot" />}
        />
        <ChartLegend content={<ChartLegendContent />} />
        {[...active].reverse().map((row) => (
          <Area
            key={row.provider}
            dataKey={row.provider}
            type="natural"
            fill={`url(#fill-${row.provider})`}
            stroke={row.color}
            strokeWidth={2}
            stackId="citations"
            activeDot={{
              r: 4,
              strokeWidth: 0,
              className: "cursor-pointer",
            }}
            className="cursor-pointer"
          />
        ))}
      </AreaChart>
    </ChartContainer>
  );
}
