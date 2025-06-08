
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
      permissions: [PERMISSIONS.VIEW_DASHBOARD, PERMISSIONS.VIEW_QUERY_PAGE] // Minimal permissions for guest
  };
};


export function useCurrentUser(): UseCurrentUserReturn {
  const [currentUser, setCurrentUser] = React.useState<CurrentUserContextValue | null>(null);
  const [isAuthLoading, setIsAuthLoading] = React.useState(true);
  const [isInitialized, setIsInitialized] = React.useState(false);
  // const router = useRouter();
  // const pathname = usePathname();

  React.useEffect(() => {
    // logger.debug("[useCurrentUser Effect Outer] Running. isInitialized:", isInitialized);
    if (typeof window === "undefined") {
      logger.debug("useCurrentUser Effect: window is undefined (SSR), skipping initialization.");
      // Important: Still need to set loading to false and initialized to true for SSR consistency if needed,
      // but client-side logic below will handle actual user fetching.
      // For now, this path leads to `currentUser` being null and `isAuthLoading` true initially.
      // This might be okay if SSR doesn't need the user, but could cause hydration issues
      // if SSR content *depends* on the user state that then changes on client.
      // Given our setup, user-dependent content is mostly client-rendered or in DashboardLayout checks.
      return;
    }

    if (isInitialized) {
      // logger.debug("useCurrentUser Effect: Already initialized, skipping actual user fetch logic.");
      return;
    }

    // logger.debug("useCurrentUser Effect: Starting initialization (isInitialized=false).");
    const initializeUser = async () => {
      // logger.debug("useCurrentUser initializeUser: Setting isAuthLoading to true.");
      setIsAuthLoading(true);
      let userToSet: CurrentUserContextValue | null = null;
      try {
        const storedUserId = localStorage.getItem(MOCK_USER_STORAGE_KEY);
        if (storedUserId) {
          logger.debug(`useCurrentUser initializeUser: Found storedUserId: ${storedUserId}. Fetching details...`);
          const userDetails = await fetchCurrentUserDetailsAction(storedUserId);
          
          // Log the raw userDetails received from the action
          logger.debug(`useCurrentUser initializeUser: Raw userDetails from fetchCurrentUserDetailsAction for ID ${storedUserId}:`, userDetails);

          if (userDetails) {
            logger.debug(`useCurrentUser initializeUser: User details successfully fetched for ${storedUserId}: ${userDetails.username}. Role: ${userDetails.roleName}.`);
            logger.debug(`useCurrentUser initializeUser: Permissions from userDetails for ${storedUserId}:`, userDetails.permissions);
            userToSet = {
              ...userDetails,
              permissions: userDetails.permissions || [], // Ensure permissions is always an array
            };
            // logger.debug(`useCurrentUser initializeUser: User object to set for ${storedUserId}:`, userToSet);
          } else {
            logger.warn(`useCurrentUser initializeUser: User details not found for stored ID "${storedUserId}". Clearing localStorage and creating guest user.`);
            localStorage.removeItem(MOCK_USER_STORAGE_KEY);
            userToSet = await createGuestUser();
          }
        } else {
          logger.debug("useCurrentUser initializeUser: No storedUserId found. Creating guest user.");
          userToSet = await createGuestUser();
        }
      } catch (error) {
        logger.error("useCurrentUser initializeUser: Error during user initialization. Creating guest user.", error as Error);
        userToSet = await createGuestUser();
      } finally {
        setCurrentUser(userToSet);
        setIsAuthLoading(false);
        setIsInitialized(true); // Mark as initialized
        logger.debug("useCurrentUser initializeUser: Initialization complete.", { 
          userSet: userToSet ? userToSet.username : 'null', 
          isAuthLoading: false, 
          isInitialized: true,
          finalPermissionsSet: userToSet ? userToSet.permissions : [],
          finalPermissionsCount: userToSet ? userToSet.permissions.length : 0
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
      setIsInitialized(false); // Reset initialization flag to force re-fetch
      logger.debug("setCurrentMockUser: Reloading window to re-initialize user state.");
      window.location.reload();
    };

    (window as any).clearCurrentMockUser = () => {
      logger.debug("Global clearCurrentMockUser called. Removing user ID from localStorage and reloading.");
      localStorage.removeItem(MOCK_USER_STORAGE_KEY);
      setIsInitialized(false); // Reset initialization flag
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
        setIsInitialized(false); // Reset initialization flag
        window.location.reload();
    };
    
    return () => {
        // logger.debug("[useCurrentUser Cleanup Effect] Running. isInitialized:", isInitialized);
    };
  }, [isInitialized]); // Dependency array only includes isInitialized

  return {
    currentUser: currentUser, // Return current state, could be null briefly during init
    isAuthLoading: isAuthLoading || !isInitialized // Consider loading if not yet initialized OR explicitly loading
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

