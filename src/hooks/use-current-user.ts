
"use client";

import type { User, RoleName, PermissionId } from '@/types';
import React, { createContext, useContext } from 'react';
import { logger } from '@/lib/logger';

export interface CurrentUserContextValue {
  id: string;
  username: string;
  email: string;
  roleId: string;
  avatar?: string;
  lastLogin?: string | undefined;
  roleName: RoleName;
  permissions: PermissionId[];
}

export interface UseCurrentUserReturn {
  currentUser: CurrentUserContextValue | null;
  isAuthLoading: boolean;
  setCurrentUser: (user: CurrentUserContextValue | null) => void;
}

export const CurrentUserContext = createContext<UseCurrentUserReturn | undefined>(undefined);
export const MOCK_USER_STORAGE_KEY = 'mock_current_user_id_v3_prisma_real_data';


export function useCurrentUser(): UseCurrentUserReturn {
  const context = useContext(CurrentUserContext);
  if (context === undefined) {
    throw new Error('useCurrentUser must be used within a CurrentUserProvider');
  }
  return context;
}

export const hasPermission = (currentUser: CurrentUserContextValue | null, permissionId: PermissionId): boolean => {
  if (!currentUser || !currentUser.permissions) return false;
  return currentUser.permissions.includes(permissionId);
};
