
"use client";

import * as React from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Cell as RechartsCell } from 'recharts';
import { ChartContainer, ChartTooltipContent } from "@/components/ui/chart";
import type { TopNItemCount } from "@/types";

interface UsageBarChartProps {
  data: TopNItemCount[];
  layout?: "horizontal" | "vertical";
  yAxisWidth?: number;
  barRadius?: [number, number, number, number];
  chartMargin?: { top?: number; right?: number; bottom?: number; left?: number; };
}

export function UsageBarChart({
  data,
  layout = "vertical",
  yAxisWidth = 100,
  barRadius = [0, 4, 4, 0],
  chartMargin = { right: 30, left: 20, top: 5, bottom: layout === 'horizontal' ? 50 : 5 }
}: UsageBarChartProps) {

  const chartDataForBar = React.useMemo(() => {
    if (!data || data.length === 0) return [];
    return data.map(item => ({
      name: item.item,
      value: item.count,
    }));
  }, [data]);

  return (
    <ChartContainer config={{}} className="w-full h-full min-h-[200px]">
      {!data || data.length === 0 ? (
        <div className="text-center text-muted-foreground p-4 h-full flex items-center justify-center text-sm">无数据可显示。</div>
      ) : (
        <BarChart data={chartDataForBar} layout={layout} margin={chartMargin}>
          <CartesianGrid strokeDasharray="3 3" horizontal={layout === "vertical"} vertical={layout === "horizontal"} />
          {layout === "vertical" ? (
            <>
              <XAxis type="number" />
              <YAxis dataKey="name" type="category" width={yAxisWidth} tick={{ fontSize: 12 }} interval={0} />
            </>
          ) : (
            <>
              <XAxis dataKey="name" type="category" angle={-45} tick={{ fontSize: 10, textAnchor: 'end' }} height={60} interval={0} />
              <YAxis type="number" allowDecimals={false} />
            </>
          )}
          <RechartsTooltip cursor={{ fill: 'hsl(var(--muted))' }} content={<ChartTooltipContent />} />
          <Bar dataKey="value" radius={barRadius}>
            {data.map((entry, index) => ( // data is TopNItemCount[] here
              <RechartsCell key={`cell-${index}`} fill={entry.fill || "hsl(var(--chart-1))"} />
            ))}
          </Bar>
        </BarChart>
      )}
    </ChartContainer>
  );
}
