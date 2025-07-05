
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
import type { Subnet } from "@/types";
import { Label } from "@/components/ui/label";

interface IPSubnetFilterProps {
  subnets: Subnet[];
  currentSubnetId?: string;
}

export function IPSubnetFilter({ subnets, currentSubnetId }: IPSubnetFilterProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const handleSubnetChange = (subnetId: string) => {
    const current = new URLSearchParams(Array.from(searchParams.entries()));

    if (!subnetId || subnetId === "all") {
      current.delete("subnetId");
    } else {
      current.set("subnetId", subnetId);
    }
    // Reset page to 1 when filter changes
    current.set("page", "1"); 
    const query = current.toString() ? `?${current.toString()}` : "";
    router.push(`${pathname}${query}`);
  };

  return (
    <div className="flex items-center gap-2">
      <Label htmlFor="subnet-filter" className="text-sm font-medium">按子网筛选:</Label>
      <Select
        value={currentSubnetId || "all"}
        onValueChange={handleSubnetChange}
      >
        <SelectTrigger id="subnet-filter" className="w-full md:w-[250px]">
          <SelectValue placeholder="选择一个子网" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">所有子网</SelectItem>
          {subnets.map((subnet) => (
            <SelectItem key={subnet.id} value={subnet.id}>
              {subnet.networkAddress} ({subnet.description || "无描述"})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
