
"use client";

import * as React from "react";
import { PieChart, Pie, Cell as RechartsCell, Tooltip as RechartsTooltip, Legend as RechartsLegend } from 'recharts';
import { ChartContainer, ChartTooltipContent } from "@/components/ui/chart";

interface IPStatusPieChartProps {
  data: Array<{ name: string; value: number; fill: string; }>;
}

// Custom ChartLegendContent component
const ChartLegendContent = (props: any) => {
    const { payload } = props;
    if (!payload || payload.length === 0) {
        return null;
    }
    return (
        <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground mt-2">
            {payload.map((entry: any, index: number) => (
                <div key={`item-${index}`} className="flex items-center gap-1.5">
                    <span style={{ backgroundColor: entry.color }} className="h-2.5 w-2.5 rounded-full inline-block"></span>
                    <span>{entry.value} ({entry.payload.name})</span> {/* Display name from payload */}
                </div>
            ))}
        </div>
    );
};

export function IPStatusPieChart({ data }: IPStatusPieChartProps) {
  return (
    <ChartContainer config={{}} className="w-full h-full min-h-[200px]">
      {!data || data.length === 0 ? (
        <div className="text-center text-muted-foreground p-4 h-full flex items-center justify-center text-sm">无 IP 状态数据可显示。</div>
      ) : (
        <PieChart>
          <RechartsTooltip
            cursor={false}
            content={<ChartTooltipContent hideLabel />}
          />
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            labelLine={false}
            outerRadius={80}
            innerRadius={50}
            dataKey="value"
            nameKey="name"
          >
            {data.map((entry, index) => (
              <RechartsCell key={`cell-${index}`} fill={entry.fill} name={entry.name} />
            ))}
          </Pie>
          <RechartsLegend content={<ChartLegendContent />} />
        </PieChart>
      )}
    </ChartContainer>
  );
}
