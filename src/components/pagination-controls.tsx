
"use client";

import * as React from "react";
import { useRouter, usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface PaginationControlsProps {
  currentPage: number;
  totalPages: number;
  basePath: string; // e.g., "/subnets"
  currentQuery?: URLSearchParams; // To preserve other query params
}

export function PaginationControls({
  currentPage,
  totalPages,
  basePath,
  currentQuery,
}: PaginationControlsProps) {
  const router = useRouter();
  const pathname = usePathname(); // Should match basePath or be more specific

  const handlePageChange = (newPage: number) => {
    const params = new URLSearchParams(currentQuery?.toString() || "");
    params.set("page", String(newPage));
    router.push(`${basePath}?${params.toString()}`);
  };

  if (totalPages <= 1) {
    return null; // Don't render pagination if only one page or less
  }

  return (
    <div className="flex items-center justify-between mt-6">
      <Button
        variant="outline"
        size="sm"
        onClick={() => handlePageChange(currentPage - 1)}
        disabled={currentPage <= 1}
      >
        <ChevronLeft className="mr-2 h-4 w-4" />
        上一页
      </Button>
      <span className="text-sm text-muted-foreground">
        第 {currentPage} 页 / 共 {totalPages} 页
      </span>
      <Button
        variant="outline"
        size="sm"
        onClick={() => handlePageChange(currentPage + 1)}
        disabled={currentPage >= totalPages}
      >
        下一页
        <ChevronRight className="ml-2 h-4 w-4" />
      </Button>
    </div>
  );
}
