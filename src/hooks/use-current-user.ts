
"use client";

import type { User, RoleName, PermissionId } from '@/types';
import { PERMISSIONS } from '@/types';
import { ADMIN_ROLE_ID, OPERATOR_ROLE_ID, VIEWER_ROLE_ID } from '../lib/data';
import { fetchCurrentUserDetailsAction, type FetchedUserDetails } from '@/lib/actions'; 
import React from 'react';
import { logger } from '@/lib/logger'; // Import logger

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

  React.useEffect(() => {
    if (typeof window === "undefined") { // Ensure this runs only on client
      logger.info("useCurrentUser Effect: window is undefined, skipping initialization (SSR).");
      setIsAuthLoading(false); // Potentially set to false if not running on client
      setIsInitialized(true); // Mark as initialized to prevent client re-run if possible
      return;
    }

    if (isInitialized) {
      logger.info("useCurrentUser Effect: Already initialized, skipping.");
      return;
    }

    logger.info("useCurrentUser Effect: Starting initialization.");
    const initializeUser = async () => {
      setIsAuthLoading(true);
      try {
        const storedUserId = localStorage.getItem(MOCK_USER_STORAGE_KEY);
        if (storedUserId) {
          logger.info(`useCurrentUser: Found storedUserId: ${storedUserId}. Fetching details...`);
          const userDetails = await fetchCurrentUserDetailsAction(storedUserId);
          if (userDetails) { 
            logger.info(`useCurrentUser: User details fetched for ${storedUserId}: ${userDetails.username}. Setting current user.`);
            setCurrentUser(userDetails);
          } else {
            logger.warn(`useCurrentUser: User details not found for stored ID "${storedUserId}" (it may be stale or invalid). Clearing this ID from localStorage and using guest user.`);
            localStorage.removeItem(MOCK_USER_STORAGE_KEY);
            setCurrentUser(await createGuestUser());
          }
        } else {
          logger.info("useCurrentUser: No storedUserId found. Using guest user.");
          setCurrentUser(await createGuestUser());
        }
      } catch (error) {
        logger.error("useCurrentUser: Error initializing current user, defaulting to guest.", error as Error);
        setCurrentUser(await createGuestUser());
      } finally {
        setIsAuthLoading(false);
        setIsInitialized(true);
        logger.info("useCurrentUser: Initialization complete.");
      }
    };

    initializeUser();

    // Expose functions to window for debugging/testing mock user states
    (window as any).setCurrentMockUser = (userId: string) => {
      if (!userId) {
        logger.warn("setCurrentMockUser called with null or empty userId. Clearing current user and reloading.");
        localStorage.removeItem(MOCK_USER_STORAGE_KEY);
      } else {
        logger.info(`setCurrentMockUser called with ID: ${userId}. Storing in localStorage and reloading.`);
        localStorage.setItem(MOCK_USER_STORAGE_KEY, userId);
      }
      setIsInitialized(false); // Force re-initialization on reload
      window.location.reload();
    };

    (window as any).clearCurrentMockUser = () => {
      logger.info("clearCurrentMockUser called. Removing user ID from localStorage and reloading.");
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
        logger.info(`Cycling mock user to ID: ${nextUserId}. Storing in localStorage and reloading.`);
        localStorage.setItem(MOCK_USER_STORAGE_KEY, nextUserId);
        setIsInitialized(false); // Force re-initialization on reload
        window.location.reload();
    };
  }, [isInitialized]); // Dependency array only on isInitialized

  return {
    currentUser: isInitialized ? currentUser : null, // Return null until initialized
    isAuthLoading: !isInitialized || isAuthLoading // Loading if not initialized OR if auth is actively loading
  };
}

export const hasPermission = (currentUser: CurrentUserContextValue | null, permissionId: PermissionId): boolean => {
  if (!currentUser) {
    // logger.debug(`hasPermission check: No current user, returning false for permission '${permissionId}'.`);
    return false;
  }
  const userHasPermission = currentUser.permissions.includes(permissionId);
  // logger.debug(`hasPermission check for user ${currentUser.username}: Permission '${permissionId}'? ${userHasPermission}. User permissions: ${currentUser.permissions.join(', ')}`);
  return userHasPermission;
};
