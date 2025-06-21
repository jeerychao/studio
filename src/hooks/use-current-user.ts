
"use client";

import type { User, RoleName, PermissionId } from '@/types';
import { PERMISSIONS } from '@/types';
import { fetchCurrentUserDetailsAction, type FetchedUserDetails } from '@/lib/actions';
import React from 'react';
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

export const MOCK_USER_STORAGE_KEY = 'mock_current_user_id_v3_prisma_real_data';

export function useCurrentUser(): UseCurrentUserReturn {
  const [currentUser, setCurrentUser] = React.useState<CurrentUserContextValue | null>(null);
  const [isAuthLoading, setIsAuthLoading] = React.useState(true);
  const isInitializedRef = React.useRef(false);

  React.useEffect(() => {
    if (isInitializedRef.current) {
      return;
    }
    isInitializedRef.current = true;

    const initializeUser = async () => {
      setIsAuthLoading(true);
      let userToSet: CurrentUserContextValue | null = null;
      try {
        const storedUserId = localStorage.getItem(MOCK_USER_STORAGE_KEY);
        if (storedUserId) {
          logger.debug(`useCurrentUser: Found storedUserId: ${storedUserId}. Fetching...`);
          const userDetails = await fetchCurrentUserDetailsAction(storedUserId);

          if (userDetails) {
            logger.debug(`useCurrentUser: User details fetched for ${userDetails.username}.`);
            userToSet = {
              ...userDetails,
              permissions: userDetails.permissions || [],
            };
          } else {
            logger.warn(`useCurrentUser: User details not found for stored ID "${storedUserId}". Clearing storage.`);
            localStorage.removeItem(MOCK_USER_STORAGE_KEY);
            userToSet = null; // Set to null instead of guest
          }
        } else {
          logger.debug("useCurrentUser: No storedUserId found. User is not authenticated.");
          userToSet = null; // Set to null instead of guest
        }
      } catch (error) {
        logger.error("useCurrentUser: Error during initialization.", error as Error);
        userToSet = null; // Set to null on error
      } finally {
        setCurrentUser(userToSet);
        setIsAuthLoading(false);
        logger.debug("useCurrentUser: Initialization complete.", { userSet: userToSet ? userToSet.username : 'null' });
      }
    };

    initializeUser();

    // Guard against re-declaration in Fast Refresh
    if (!(window as any).setCurrentMockUser) {
        (window as any).setCurrentMockUser = (userId: string | null) => {
          logger.debug(`Global setCurrentMockUser called with ID: ${userId}. Reloading.`);
          if (!userId || userId.trim() === "") {
            localStorage.removeItem(MOCK_USER_STORAGE_KEY);
          } else {
            localStorage.setItem(MOCK_USER_STORAGE_KEY, userId);
          }
          window.location.reload();
        };
    }
    
  }, []); // Empty dependency array ensures this runs only once per application lifecycle.

  return {
    currentUser: currentUser,
    isAuthLoading: isAuthLoading
  };
}

export const hasPermission = (currentUser: CurrentUserContextValue | null, permissionId: PermissionId): boolean => {
  if (!currentUser || !currentUser.permissions) {
    return false;
  }
  return currentUser.permissions.includes(permissionId);
};
