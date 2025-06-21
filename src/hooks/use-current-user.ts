
"use client";

import type { User, RoleName, PermissionId } from '@/types';
import React, { createContext, useContext, useMemo, useState, useEffect, useRef } from 'react';
import { fetchCurrentUserDetailsAction } from '@/lib/actions';
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
}

export const CurrentUserContext = createContext<UseCurrentUserReturn | undefined>(undefined);
export const MOCK_USER_STORAGE_KEY = 'mock_current_user_id_v3_prisma_real_data';

export const CurrentUserProvider = ({ children }: { children: React.ReactNode }) => {
  const [currentUser, setCurrentUser] = useState<CurrentUserContextValue | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const isInitializedRef = useRef(false);

  useEffect(() => {
    if (isInitializedRef.current) return;
    isInitializedRef.current = true;

    const initializeUser = async () => {
      setIsAuthLoading(true);
      let userToSet: CurrentUserContextValue | null = null;
      try {
        const storedUserId = localStorage.getItem(MOCK_USER_STORAGE_KEY);
        if (storedUserId) {
          logger.debug(`CurrentUserProvider: Found storedUserId: ${storedUserId}. Fetching details...`);
          const userDetails = await fetchCurrentUserDetailsAction(storedUserId);
          if (userDetails) {
            logger.debug(`CurrentUserProvider: User details fetched for ${userDetails.username}.`);
            userToSet = { ...userDetails, permissions: userDetails.permissions || [] };
          } else {
            logger.warn(`CurrentUserProvider: User details not found for stored ID "${storedUserId}". Clearing storage.`);
            localStorage.removeItem(MOCK_USER_STORAGE_KEY);
          }
        } else {
          logger.debug("CurrentUserProvider: No storedUserId found. User is not authenticated.");
        }
      } catch (error) {
        logger.error("CurrentUserProvider: Error during user initialization.", error as Error);
      } finally {
        setCurrentUser(userToSet);
        setIsAuthLoading(false);
        logger.debug("CurrentUserProvider: Initialization complete.", { userSet: userToSet ? userToSet.username : 'null' });
      }
    };

    initializeUser();

    if (typeof window !== "undefined" && !(window as any).setCurrentMockUser) {
      (window as any).setCurrentMockUser = (userId: string | null) => {
        logger.debug(`Global setCurrentMockUser called with ID: ${userId}. Reloading window.`);
        if (!userId || userId.trim() === "") {
          localStorage.removeItem(MOCK_USER_STORAGE_KEY);
        } else {
          localStorage.setItem(MOCK_USER_STORAGE_KEY, userId);
        }
        window.location.reload();
      };
    }
  }, []);

  const value = useMemo(() => ({
    currentUser,
    isAuthLoading,
  }), [currentUser, isAuthLoading]);

  return React.createElement(CurrentUserContext.Provider, { value }, children);
};

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
