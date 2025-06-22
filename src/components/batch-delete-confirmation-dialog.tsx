"use client";

import * as React from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import type { BatchDeleteResult, BatchOperationFailure } from "@/types";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, CheckCircle2, Trash2, Loader2 } from "lucide-react";

interface BatchDeleteConfirmationDialogProps {
  selectedIds: Set<string>;
  itemTypeDisplayName: string; // e.g., "子网", "VLANs", "IP 地址"
  batchDeleteAction: (ids: string[]) => Promise<BatchDeleteResult>;
  onBatchDeleted: () => void; // Callback to refresh data and clear selections
  triggerButton?: React.ReactElement; // Optional custom trigger
}

export function BatchDeleteConfirmationDialog({
  selectedIds,
  itemTypeDisplayName,
  batchDeleteAction,
  onBatchDeleted,
  triggerButton,
}: BatchDeleteConfirmationDialogProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState(false);
  const [deleteResult, setDeleteResult] = React.useState<BatchDeleteResult | null>(null);
  const { toast } = useToast();

  const handleConfirmDelete = async () => {
    setIsDeleting(true);
    setDeleteResult(null);
    try {
      const result = await batchDeleteAction(Array.from(selectedIds));
      setDeleteResult(result);

      if (result.successCount > 0 && result.failureCount === 0) {
        toast({
          title: "批量删除成功",
          description: `${result.successCount} 个${itemTypeDisplayName}已成功删除。`,
          variant: "default",
          duration: 5000,
        });
      } else if (result.successCount > 0 && result.failureCount > 0) {
        toast({
          title: "批量删除部分成功",
          description: `${result.successCount} 个${itemTypeDisplayName}已删除，${result.failureCount} 个失败。详情请查看对话框。`,
          variant: "default", // Keep as default, details are in dialog
          duration: 7000, // Slightly longer for user to notice
        });
      } else if (result.failureCount > 0) {
         toast({
          title: "批量删除失败",
          description: `所有选中的 ${result.failureCount} 个${itemTypeDisplayName}均删除失败。详情请查看对话框。`,
          variant: "destructive",
          duration: 7000,
        });
      } else {
         toast({ title: "无操作", description: `没有${itemTypeDisplayName}被删除。`, variant: "default" });
      }

      if (result.successCount > 0) {
        onBatchDeleted(); // Refresh data and clear selections
      }

      if (result.failureCount === 0 && result.successCount > 0) { // Only close if all successful
        setIsOpen(false);
      }
      // If there are failures, the dialog remains open for the user to see details.

    } catch (error) {
      toast({
        title: "批量删除出错",
        description: (error as Error).message || "执行批量删除时发生意外错误。",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (!open) {
        setDeleteResult(null);
    }
  };

  const Trigger = triggerButton ? (
    React.cloneElement(triggerButton, { onClick: () => setIsOpen(true) })
  ) : (
    <Button
      variant="destructive"
      onClick={() => setIsOpen(true)}
      disabled={selectedIds.size === 0 || isDeleting}
    >
      <Trash2 className="mr-2 h-4 w-4" />
      批量删除 ({selectedIds.size})
    </Button>
  );

  return (
    <AlertDialog open={isOpen} onOpenChange={handleOpenChange}>
      <AlertDialogTrigger asChild>{Trigger}</AlertDialogTrigger>
      <AlertDialogContent className="sm:max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>确认批量删除</AlertDialogTitle>
          <AlertDialogDescription>
            您确定要删除选中的 <strong>{selectedIds.size}</strong> 个{itemTypeDisplayName}吗？此操作无法撤销，所有关联数据（如果适用且未被其他记录保护）也将被删除或解除关联。
          </AlertDialogDescription>
        </AlertDialogHeader>

        {deleteResult && (
          <div className="mt-4 space-y-2">
            <h4 className="font-semibold">删除结果:</h4>
            <Alert variant={deleteResult.failureCount > 0 ? "destructive" : "default"}>
              {deleteResult.failureCount > 0 ? <AlertCircle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
              <AlertTitle>{deleteResult.failureCount > 0 ? (deleteResult.successCount > 0 ? "部分成功" : "操作失败") : "全部成功"}</AlertTitle>
              <AlertDescription>
                成功删除: {deleteResult.successCount} 个. 失败: {deleteResult.failureCount} 个.
              </AlertDescription>
            </Alert>
            {deleteResult.failureDetails.length > 0 && (
              <div className="border p-2 rounded-md">
                <p className="text-sm font-medium text-destructive">失败详情:</p>
                <ScrollArea className="h-[150px] mt-1 text-xs">
                  <ul className="list-disc list-inside space-y-1">
                    {deleteResult.failureDetails.map((failure, index) => (
                      <li key={failure.id || index}>
                        <strong>{failure.itemIdentifier}:</strong> {failure.error}
                      </li>
                    ))}
                  </ul>
                </ScrollArea>
              </div>
            )}
          </div>
        )}

        <AlertDialogFooter className="mt-2">
          <AlertDialogCancel onClick={() => setIsOpen(false)} disabled={isDeleting}>
            取消
          </AlertDialogCancel>
          {/* Show "Confirm Delete" or "Retry Failed" only if there's no result OR there were failures */}
          {(!deleteResult || deleteResult.failureCount > 0) && (
            <AlertDialogAction
                onClick={handleConfirmDelete}
                disabled={isDeleting || selectedIds.size === 0}
                className={!deleteResult ? "bg-destructive hover:bg-destructive/90 text-destructive-foreground" : ""}
            >
            {isDeleting ? (
                <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    删除中...
                </>
            ) : (
                deleteResult ? `重试失败的 (${deleteResult.failureCount})` : "确认删除"
            )}
            </AlertDialogAction>
          )}
          {/* If all successful, the primary action above won't show. User can close with "Cancel" or implicitly. */}
          {/* Or add an explicit "Close" button if all were successful */}
          {deleteResult && deleteResult.failureCount === 0 && deleteResult.successCount > 0 && (
             <Button onClick={() => setIsOpen(false)}>关闭</Button>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
