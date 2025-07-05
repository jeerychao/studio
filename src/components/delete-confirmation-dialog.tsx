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
import type { ActionResponse } from "@/lib/actions"; // Import ActionResponse
import { Loader2 } from "lucide-react";

interface DeleteConfirmationDialogProps {
  itemId: string;
  itemName: string;
  deleteAction: (id: string) => Promise<ActionResponse<unknown>>; // Updated type
  triggerButton: React.ReactElement;
  onDeleted?: () => void;
  dialogTitle?: string;
  dialogDescription?: string;
}

export function DeleteConfirmationDialog({
  itemId,
  itemName,
  deleteAction,
  triggerButton,
  onDeleted,
  dialogTitle = "您确定吗?",
  dialogDescription,
}: DeleteConfirmationDialogProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState(false);
  const { toast } = useToast();

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const result = await deleteAction(itemId);

      if (result.success) {
        toast({
          title: "删除成功",
          description: `${itemName} 已被删除。`,
        });
        setIsOpen(false);
        if (onDeleted) onDeleted();
      } else {
        toast({
          title: "删除失败",
          description: result.error?.userMessage || `无法删除 ${itemName}。请重试。`,
          variant: "destructive",
        });
      }
    } catch (error) { // Catch unexpected errors during the action call itself
      toast({
        title: "错误",
        description: error instanceof Error ? error.message : "删除过程中发生意外错误。",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };
  
  const Trigger = React.cloneElement(triggerButton, {
    onClick: () => setIsOpen(true),
  });

  const effectiveDescription = dialogDescription || 
    `此操作无法撤销。这将永久删除“${itemName}”及其所有关联数据。`;

  return (
    <AlertDialog open={isOpen} onOpenChange={setIsOpen}>
      <AlertDialogTrigger asChild>
        {Trigger}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{dialogTitle}</AlertDialogTitle>
          <AlertDialogDescription>
            {effectiveDescription.split('“').map((part, index, array) => 
              index < array.length -1 
              ? <React.Fragment key={index}>{part}<strong className="text-foreground">“{array[index+1].substring(0, array[index+1].indexOf('”'))}”</strong>{array[index+1].substring(array[index+1].indexOf('”')+1)}</React.Fragment>
              : part
            ).reduce((acc: (string | JSX.Element)[], part, index) => {
                if (index === 0 && typeof part === 'string' && part.includes('”')) { 
                    const firstStrongEnd = part.indexOf('”') + 1;
                    const beforeStrong = part.substring(0, part.indexOf('“'));
                    const strongText = part.substring(part.indexOf('“'), firstStrongEnd);
                    const afterStrong = part.substring(firstStrongEnd);
                     if(part.indexOf('“') !== -1){
                         return [
                            beforeStrong, 
                            <strong className="text-foreground" key={`desc-strong-${index}`}>{strongText.replace(/“|”/g, '')}</strong>,
                            afterStrong
                        ];
                    }
                }
                if (index > 0 && typeof acc[acc.length-1] === 'object' && React.isValidElement(acc[acc.length-1])) { 
                    return [...acc, part];
                }
                if (typeof part === 'string' && part.includes('“') && part.includes('”')) {
                     const strongStart = part.indexOf('“');
                     const strongEnd = part.indexOf('”') + 1;
                     return [
                        ...acc,
                        part.substring(0, strongStart),
                        <strong className="text-foreground" key={`desc-strong-${index}`}>{part.substring(strongStart, strongEnd).replace(/“|”/g, '')}</strong>,
                        part.substring(strongEnd)
                     ];
                }
                return [...acc, part];
            }, [] as (string | JSX.Element)[])}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>取消</AlertDialogCancel>
          <AlertDialogAction onClick={handleDelete} disabled={isDeleting} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">
            {isDeleting ? (
                <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    删除中...
                </>
            ) : (
                "删除"
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
