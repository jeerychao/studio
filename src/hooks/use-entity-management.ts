"use client";

import * as React from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useCurrentUser, hasPermission } from "./use-current-user";
import { useToast } from "./use-toast";
import type { PaginatedResponse, PermissionId } from "@/types";
import { DEFAULT_PAGE_SIZE } from "@/lib/constants";

interface UseEntityManagementOptions<TFetchParams> {
  fetchAction: (params: TFetchParams) => Promise<PaginatedResponse<any>>;
  fetchActionParams?: Omit<TFetchParams, 'page' | 'pageSize'>;
  permission: {
    view: PermissionId;
    create?: PermissionId;
    edit?: PermissionId;
    delete?: PermissionId;
  };
  pageSize?: number;
  dependencies?: any[]; // Additional dependencies to trigger refetch
}

export function useEntityManagement<TData, TFetchParams extends { page?: number; pageSize?: number; }>({
  fetchAction,
  fetchActionParams,
  permission,
  pageSize = DEFAULT_PAGE_SIZE,
  dependencies = [],
}: UseEntityManagementOptions<TFetchParams>) {
  const [data, setData] = React.useState<PaginatedResponse<TData> | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const { currentUser, isAuthLoading } = useCurrentUser();
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const currentPage = Number(searchParams.get('page')) || 1;

  const canView = hasPermission(currentUser, permission.view);
  const canCreate = permission.create ? hasPermission(currentUser, permission.create) : false;
  const canEdit = permission.edit ? hasPermission(currentUser, permission.edit) : false;
  const canDelete = permission.delete ? hasPermission(currentUser, permission.delete) : false;

  const fetchData = React.useCallback(async () => {
    if (isAuthLoading || !currentUser || !canView) {
      if (!isAuthLoading && !canView) {
        setIsLoading(false);
      }
      return;
    }

    setIsLoading(true);
    try {
      const params = {
        page: currentPage,
        pageSize,
        ...fetchActionParams,
      } as TFetchParams;
      
      const result = await fetchAction(params);
      setData(result);

      // Handle cases where the current page is no longer valid after a deletion
      if (result.data.length === 0 && result.currentPage > 1 && result.currentPage > result.totalPages) {
        const newTargetPage = result.totalPages > 0 ? result.totalPages : 1;
        const newParams = new URLSearchParams(searchParams.toString());
        newParams.set("page", String(newTargetPage));
        router.push(`${pathname}?${newParams.toString()}`);
      }

    } catch (error) {
      toast({
        title: "获取数据错误",
        description: (error as Error).message,
        variant: "destructive",
      });
      setData({ data: [], totalCount: 0, currentPage: 1, totalPages: 0, pageSize });
    } finally {
      setIsLoading(false);
    }
  }, [
    isAuthLoading,
    currentUser,
    canView,
    currentPage,
    pageSize,
    fetchAction,
    toast,
    router,
    pathname,
    searchParams,
    JSON.stringify(fetchActionParams), 
    ...dependencies
  ]);

  React.useEffect(() => {
    let isMounted = true;
    const performFetch = async () => {
      if(isMounted) await fetchData();
    };
    performFetch();
    return () => { isMounted = false; };
  }, [fetchData]);

  return {
    data,
    isLoading: isAuthLoading || isLoading,
    fetchData,
    canView,
    canCreate,
    canEdit,
    canDelete,
    currentPage
  };
}
