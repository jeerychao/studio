
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

interface DeleteConfirmationDialogProps {
  itemId: string;
  itemName: string;
  deleteAction: (id: string) => Promise<{ success: boolean; message?: string } | void>;
  triggerButton: React.ReactElement; // Expects a Button component usually
  onDeleted?: () => void; // Optional callback after successful deletion
}

export function DeleteConfirmationDialog({
  itemId,
  itemName,
  deleteAction,
  triggerButton,
  onDeleted,
}: DeleteConfirmationDialogProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState(false);
  const { toast } = useToast();

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const result = await deleteAction(itemId);
      // Assuming action returns { success: true } or throws error / returns { success: false }
      const success = typeof result === 'object' ? result?.success : true; // void means success
      const message = typeof result === 'object' ? result?.message : undefined;

      if (success) {
        toast({
          title: "Deleted Successfully",
          description: `${itemName} has been deleted.`,
        });
        setIsOpen(false);
        if (onDeleted) onDeleted();
      } else {
        toast({
          title: "Deletion Failed",
          description: message || `Could not delete ${itemName}. Please try again.`,
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "An unexpected error occurred during deletion.",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };
  
  // Ensure the triggerButton has its onClick handler correctly assigned to open the dialog
  const Trigger = React.cloneElement(triggerButton, {
    onClick: () => setIsOpen(true),
  });


  return (
    <AlertDialog open={isOpen} onOpenChange={setIsOpen}>
      <AlertDialogTrigger asChild>
        {Trigger}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
          <AlertDialogDescription>
            This action cannot be undone. This will permanently delete{" "}
            <strong className="text-foreground">{itemName}</strong> and any associated data.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleDelete} disabled={isDeleting} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">
            {isDeleting ? "Deleting..." : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
