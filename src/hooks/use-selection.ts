"use client";

import * as React from "react";

export function useSelection<T extends { id: string }>(items: T[] = []) {
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());

  // Reset selection when items change (e.g., page navigation)
  React.useEffect(() => {
    setSelectedIds(new Set());
  }, [items]);

  const handleSelectAll = React.useCallback((checked: boolean | 'indeterminate') => {
    if (checked === true) {
      setSelectedIds(new Set(items.map(item => item.id)));
    } else {
      setSelectedIds(new Set());
    }
  }, [items]);

  const handleSelectItem = React.useCallback((id: string, checked: boolean | 'indeterminate') => {
    setSelectedIds(prev => {
      const newSelectedIds = new Set(prev);
      if (checked === true) {
        newSelectedIds.add(id);
      } else {
        newSelectedIds.delete(id);
      }
      return newSelectedIds;
    });
  }, []);

  const isAllSelected = items.length > 0 && selectedIds.size === items.length;
  const isSomeSelected = selectedIds.size > 0 && selectedIds.size < items.length;
  
  const selectedState: 'all' | 'some' | 'none' = isAllSelected ? 'all' : (isSomeSelected || (selectedIds.size > 0)) ? 'some' : 'none';
  const checkboxState: boolean | 'indeterminate' = selectedState === 'all' ? true : selectedState === 'some' ? 'indeterminate' : false;

  return {
    selectedIds,
    setSelectedIds,
    handleSelectAll,
    handleSelectItem,
    checkboxState
  };
}
