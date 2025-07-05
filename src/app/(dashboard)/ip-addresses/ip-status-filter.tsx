
"use client";

import * as React from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { IPAddressStatus } from "@/types";
import { Label } from "@/components/ui/label";

const statusOptions: Array<{ value: IPAddressStatus | 'all'; label: string }> = [
  { value: "all", label: "全部状态" },
  { value: "allocated", label: "已分配" },
  { value: "free", label: "空闲" },
  { value: "reserved", label: "预留" },
];

interface IPStatusFilterProps {
  currentStatus?: string; // from URL, could be IPAddressStatus or 'all'
}

export function IPStatusFilter({ currentStatus }: IPStatusFilterProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const handleStatusChange = (statusValue: string) => {
    const current = new URLSearchParams(Array.from(searchParams.entries()));

    if (!statusValue || statusValue === "all") {
      current.delete("status");
    } else {
      current.set("status", statusValue);
    }
    // Reset page to 1 when filter changes
    current.set("page", "1");
    const query = current.toString() ? `?${current.toString()}` : "";
    router.push(`${pathname}${query}`);
  };

  return (
    <div className="flex items-center gap-2">
      <Label htmlFor="status-filter" className="text-sm font-medium shrink-0">按状态筛选:</Label>
      <Select
        value={currentStatus || "all"}
        onValueChange={handleStatusChange}
      >
        <SelectTrigger id="status-filter" className="w-full md:w-[180px]">
          <SelectValue placeholder="选择状态" />
        </SelectTrigger>
        <SelectContent>
          {statusOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
