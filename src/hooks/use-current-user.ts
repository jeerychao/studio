
"use client";

import type { User, RoleName, PermissionId } from '@/types';
import { PERMISSIONS } from '@/types';
import { ADMIN_ROLE_ID, OPERATOR_ROLE_ID, VIEWER_ROLE_ID } from '../lib/data';
import { fetchCurrentUserDetailsAction, type FetchedUserDetails } from '@/lib/actions';
import React from 'react';
import { logger } from '@/lib/logger';
import { useRouter, usePathname } from 'next/navigation'; // Keep router and pathname if used by window functions

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
  let guestPermissions: PermissionId[] = [
      PERMISSIONS.VIEW_DASHBOARD,
      PERMISSIONS.VIEW_SUBNET,
      PERMISSIONS.VIEW_VLAN,
      PERMISSIONS.VIEW_IPADDRESS,
      PERMISSIONS.VIEW_AUDIT_LOG,
      PERMISSIONS.VIEW_QUERY_PAGE,
  ];
  let guestRoleName: RoleName = 'Viewer';
  logger.info("useCurrentUser: Creating guest user object.");
  return {
      id: 'guest-fallback-id',
      username: 'Guest',
      email: 'guest@example.com',
      roleId: VIEWER_ROLE_ID,
      avatar: '/images/avatars/default_avatar.png',
      lastLogin: undefined,
      roleName: guestRoleName,
      permissions: guestPermissions
  };
};


export function useCurrentUser(): UseCurrentUserReturn {
  const [currentUser, setCurrentUser] = React.useState<CurrentUserContextValue | null>(null);
  const [isAuthLoading, setIsAuthLoading] = React.useState(true);
  const [isInitialized, setIsInitialized] = React.useState(false);
  // Router and pathname might be needed if window functions cause navigation or depend on path
  const router = useRouter(); 
  const pathname = usePathname();

  React.useEffect(() => {
    if (typeof window === "undefined") {
      // logger.debug("useCurrentUser Effect: window is undefined, skipping initialization (SSR).");
      setIsAuthLoading(false); // Should not be loading on server for this hook's purpose
      setIsInitialized(true); // Mark as initialized for server context
      return;
    }

    if (isInitialized) {
      // logger.debug("useCurrentUser Effect: Already initialized, skipping.");
      return;
    }

    // logger.debug("useCurrentUser Effect: Starting initialization.");
    const initializeUser = async () => {
      setIsAuthLoading(true);
      let userToSet: CurrentUserContextValue | null = null;
      try {
        const storedUserId = localStorage.getItem(MOCK_USER_STORAGE_KEY);
        if (storedUserId) {
          // logger.debug(`useCurrentUser: Found storedUserId: ${storedUserId}. Fetching details...`);
          const userDetails = await fetchCurrentUserDetailsAction(storedUserId);
          if (userDetails) {
            // logger.debug(`useCurrentUser: User details fetched for ${storedUserId}: ${userDetails.username}. Permissions: ${userDetails.permissions?.join(', ')}. Setting current user.`);
            userToSet = userDetails;
          } else {
            // logger.warn(`useCurrentUser: User details not found for stored ID "${storedUserId}". Clearing localStorage and using guest user.`);
            localStorage.removeItem(MOCK_USER_STORAGE_KEY);
            userToSet = await createGuestUser();
          }
        } else {
          // logger.debug("useCurrentUser: No storedUserId found. Using guest user.");
          userToSet = await createGuestUser();
        }
      } catch (error) {
        logger.error("useCurrentUser: Error initializing current user, defaulting to guest.", error as Error);
        userToSet = await createGuestUser();
      } finally {
        setCurrentUser(userToSet);
        setIsAuthLoading(false);
        setIsInitialized(true);
        // logger.debug("useCurrentUser: Initialization complete.", { userSet: userToSet?.username, isAuthLoading: false, isInitialized: true });
      }
    };

    initializeUser();

    (window as any).setCurrentMockUser = (userId: string | null) => {
      // logger.debug(`setCurrentMockUser called with ID: ${userId}.`);
      if (!userId || userId.trim() === "") {
        // logger.debug("setCurrentMockUser: Clearing user ID from localStorage.");
        localStorage.removeItem(MOCK_USER_STORAGE_KEY);
      } else {
        // logger.debug(`setCurrentMockUser: Storing user ID ${userId} in localStorage.`);
        localStorage.setItem(MOCK_USER_STORAGE_KEY, userId);
      }
      setIsInitialized(false); // Force re-initialization
      // logger.debug("setCurrentMockUser: Reloading window.");
      window.location.reload();
    };

    (window as any).clearCurrentMockUser = () => {
      // logger.debug("clearCurrentMockUser called. Removing user ID from localStorage and reloading.");
      localStorage.removeItem(MOCK_USER_STORAGE_KEY);
      setIsInitialized(false); // Force re-initialization
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
        // logger.debug(`Cycling mock user to ID: ${nextUserId}. Storing in localStorage and reloading.`);
        localStorage.setItem(MOCK_USER_STORAGE_KEY, nextUserId);
        setIsInitialized(false); // Force re-initialization
        window.location.reload();
    };
    
    return () => {
        // logger.debug("useCurrentUser Effect: Cleanup function called. isInitialized was: " + isInitialized);
    };
  }, [isInitialized]); // Only re-run if isInitialized changes (e.g., after manual reset)

  return {
    currentUser: isInitialized ? currentUser : null, // Return null if not yet initialized on client
    isAuthLoading: !isInitialized || isAuthLoading // Loading if not initialized OR if actively loading auth data
  };
}

export const hasPermission = (currentUser: CurrentUserContextValue | null, permissionId: PermissionId): boolean => {
  if (!currentUser || !currentUser.permissions || !Array.isArray(currentUser.permissions)) {
    return false;
  }
  const userHasPermission = currentUser.permissions.includes(permissionId);
  // logger.debug(`hasPermission check: User: ${currentUser.username}, Permission: ${permissionId}, Has: ${userHasPermission}`);
  return userHasPermission;
};
