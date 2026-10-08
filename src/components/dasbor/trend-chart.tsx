"use client";

import * as React from "react";
import { useReducedMotion } from "motion/react";
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Money } from "@/core/money/money";

const chartConfig = {
  value: { label: "Laba bersih" },
  surplus: { label: "Surplus", color: "var(--color-debit)" },
  defisit: { label: "Defisit", color: "var(--color-credit)" },
} satisfies ChartConfig;

/**
 * Tren laba bersih 6 bulan — batang divergen: surplus hijau daun di atas
 * garis nol, defisit bata kredit di bawahnya. Warna = makna data (SAK),
 * bukan dekorasi; terra tidak dipakai di sini.
 */
export function TrendChart({
  months,
  valuesMinor,
}: {
  months: Array<{ y: number; m: number; label: string }>;
  valuesMinor: bigint[];
}) {
  const reduce = useReducedMotion();
  const data = months.map((m, i) => {
    const v = valuesMinor[i] ?? 0n;
    return {
      month: m.label,
      key: `${m.y}-${m.m}`,
      value: Number(v),
      fill: v >= 0n ? "var(--color-debit)" : "var(--color-credit)",
    };
  });

  return (
    <ChartContainer config={chartConfig} className="h-40 w-full">
      <BarChart accessibilityLayer data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--color-rule)" strokeOpacity={0.6} />
        <XAxis
          dataKey="month"
          tickLine={false}
          axisLine={false}
          tickMargin={6}
          tick={{ fontSize: 11, fill: "var(--color-ink-soft)" }}
        />
        <YAxis hide domain={["auto", "auto"]} />
        <ReferenceLine y={0} stroke="var(--color-ink)" strokeOpacity={0.25} />
        <ChartTooltip
          content={
            <ChartTooltipContent
              labelKey="month"
              formatter={(value) =>
                Money.fromMinor(BigInt(Math.round(Number(value)))).formatIdr()
              }
            />
          }
        />
        <Bar
          dataKey="value"
          radius={4}
          isAnimationActive={!reduce}
          animationDuration={500}
          animationEasing="ease-out"
        >
          {data.map((d) => (
            <Cell key={d.key} fill={d.fill} fillOpacity={0.85} />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}
