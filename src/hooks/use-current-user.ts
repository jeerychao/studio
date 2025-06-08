
"use client";

import type { User, RoleName, PermissionId } from '@/types';
import { PERMISSIONS } from '@/types';
import { ADMIN_ROLE_ID, OPERATOR_ROLE_ID, VIEWER_ROLE_ID } from '../lib/data';
import { fetchCurrentUserDetailsAction, type FetchedUserDetails } from '@/lib/actions';
import React from 'react';
import { logger } from '@/lib/logger';
import { useRouter, usePathname } from 'next/navigation';

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

const createGuestUser = async (): Promise<CurrentUserContextValue> => {
  logger.debug("[createGuestUser] Creating minimal guest user object.");
  return {
      id: 'guest-fallback-id',
      username: 'Guest',
      email: 'guest@example.com',
      roleId: VIEWER_ROLE_ID,
      avatar: '/images/avatars/default_avatar.png',
      lastLogin: undefined,
      roleName: 'Viewer',
      permissions: [PERMISSIONS.VIEW_DASHBOARD] // Minimal permissions for guest
  };
};


export function useCurrentUser(): UseCurrentUserReturn {
  const [currentUser, setCurrentUser] = React.useState<CurrentUserContextValue | null>(null);
  const [isAuthLoading, setIsAuthLoading] = React.useState(true);
  const [isInitialized, setIsInitialized] = React.useState(false);
  // const router = useRouter();
  // const pathname = usePathname();

  React.useEffect(() => {
    if (typeof window === "undefined") {
      logger.debug("useCurrentUser Effect: window is undefined (SSR), skipping initialization.");
      setIsAuthLoading(false);
      setIsInitialized(true);
      return;
    }

    if (isInitialized) {
      logger.debug("useCurrentUser Effect: Already initialized, skipping.");
      return;
    }

    logger.debug("useCurrentUser Effect: Starting initialization.");
    const initializeUser = async () => {
      setIsAuthLoading(true);
      let userToSet: CurrentUserContextValue | null = null;
      try {
        const storedUserId = localStorage.getItem(MOCK_USER_STORAGE_KEY);
        if (storedUserId) {
          logger.debug(`useCurrentUser: Found storedUserId: ${storedUserId}. Fetching details...`);
          const userDetails = await fetchCurrentUserDetailsAction(storedUserId);
          if (userDetails) {
            logger.debug(`useCurrentUser: User details fetched for ${storedUserId}: ${userDetails.username}. Role: ${userDetails.roleName}. Permissions raw:`, userDetails.permissions);
            userToSet = {
              ...userDetails,
              permissions: userDetails.permissions || [], // Ensure permissions is always an array
            };
            logger.debug(`useCurrentUser: User object to set:`, userToSet);
          } else {
            logger.warn(`useCurrentUser: User details not found for stored ID "${storedUserId}". Clearing localStorage and creating guest user.`);
            localStorage.removeItem(MOCK_USER_STORAGE_KEY);
            userToSet = await createGuestUser();
          }
        } else {
          logger.debug("useCurrentUser: No storedUserId found. Creating guest user.");
          userToSet = await createGuestUser();
        }
      } catch (error) {
        logger.error("useCurrentUser: Error initializing current user, creating guest user.", error as Error);
        userToSet = await createGuestUser();
      } finally {
        setCurrentUser(userToSet);
        setIsAuthLoading(false);
        setIsInitialized(true);
        logger.debug("useCurrentUser: Initialization complete.", { 
          userSet: userToSet ? userToSet.username : 'null', 
          isAuthLoading: false, 
          isInitialized: true,
          finalPermissions: userToSet ? userToSet.permissions : []
        });
      }
    };

    initializeUser();

    (window as any).setCurrentMockUser = (userId: string | null) => {
      logger.debug(`Global setCurrentMockUser called with ID: ${userId}.`);
      if (!userId || userId.trim() === "") {
        logger.debug("setCurrentMockUser: Clearing user ID from localStorage.");
        localStorage.removeItem(MOCK_USER_STORAGE_KEY);
      } else {
        logger.debug(`setCurrentMockUser: Storing user ID ${userId} in localStorage.`);
        localStorage.setItem(MOCK_USER_STORAGE_KEY, userId);
      }
      setIsInitialized(false);
      logger.debug("setCurrentMockUser: Reloading window to re-initialize user state.");
      window.location.reload();
    };

    (window as any).clearCurrentMockUser = () => {
      logger.debug("Global clearCurrentMockUser called. Removing user ID from localStorage and reloading.");
      localStorage.removeItem(MOCK_USER_STORAGE_KEY);
      setIsInitialized(false);
      window.location.reload();
    };

    (window as any).cycleMockUser = () => {
        const userCycleOrder = [
            'seed_user_admin',
            'seed_user_operator',
            'seed_user_viewer'
        ];
        const currentStoredId = localStorage.getItem(MOCK_USER_STORAGE_KEY);
        let nextUserId = userCycleOrder[0];

        if (currentStoredId) {
            const currentIndex = userCycleOrder.indexOf(currentStoredId);
            if (currentIndex !== -1) {
                nextUserId = userCycleOrder[(currentIndex + 1) % userCycleOrder.length];
            }
        }
        logger.debug(`Global cycleMockUser: Cycling to ID: ${nextUserId}. Storing and reloading.`);
        localStorage.setItem(MOCK_USER_STORAGE_KEY, nextUserId);
        setIsInitialized(false);
        window.location.reload();
    };
    
    return () => {
        // logger.debug("[useCurrentUser Cleanup Effect]", { path: pathname });
    };
  }, [isInitialized]);

  return {
    currentUser: isInitialized ? currentUser : null, 
    isAuthLoading: !isInitialized || isAuthLoading 
  };
}

export const hasPermission = (currentUser: CurrentUserContextValue | null, permissionId: PermissionId): boolean => {
  if (!currentUser || !currentUser.permissions || !Array.isArray(currentUser.permissions)) {
    // logger.debug(`[hasPermission] Check for perm '${permissionId}': User is null or permissions array is invalid. Returning false.`);
    return false;
  }
  const userHasPermission = currentUser.permissions.includes(permissionId);
  // logger.debug(`[hasPermission] Check for perm '${permissionId}' for user '${currentUser.username}': Result: ${userHasPermission}. User perms: [${currentUser.permissions.join(', ')}]`);
  return userHasPermission;
};

