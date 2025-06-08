
"use client";

import type { User, RoleName, PermissionId } from '@/types';
import { PERMISSIONS } from '@/types';
import { ADMIN_ROLE_ID, OPERATOR_ROLE_ID, VIEWER_ROLE_ID } from '../lib/data';
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
    if (typeof window === "undefined") {
      logger.info("useCurrentUser Effect: window is undefined, skipping initialization (SSR).");
      setIsAuthLoading(false);
      setIsInitialized(true);
      return;
    }

    if (isInitialized) {
      logger.info("useCurrentUser Effect: Already initialized, skipping.");
      return;
    }

    logger.info("useCurrentUser Effect: Starting initialization.");
    const initializeUser = async () => {
      setIsAuthLoading(true);
      let userToSet: CurrentUserContextValue | null = null;
      try {
        const storedUserId = localStorage.getItem(MOCK_USER_STORAGE_KEY);
        if (storedUserId) {
          logger.info(`useCurrentUser: Found storedUserId: ${storedUserId}. Fetching details...`);
          const userDetails = await fetchCurrentUserDetailsAction(storedUserId);
          if (userDetails) {
            logger.info(`useCurrentUser: User details fetched for ${storedUserId}: ${userDetails.username}. Setting current user.`);
            userToSet = userDetails;
          } else {
            logger.warn(`useCurrentUser: User details not found for stored ID "${storedUserId}". Clearing localStorage and using guest user.`);
            localStorage.removeItem(MOCK_USER_STORAGE_KEY);
            userToSet = await createGuestUser();
          }
        } else {
          logger.info("useCurrentUser: No storedUserId found. Using guest user.");
          userToSet = await createGuestUser();
        }
      } catch (error) {
        logger.error("useCurrentUser: Error initializing current user, defaulting to guest.", error as Error);
        userToSet = await createGuestUser();
      } finally {
        setCurrentUser(userToSet);
        setIsAuthLoading(false);
        setIsInitialized(true);
        logger.info("useCurrentUser: Initialization complete.", { userSet: userToSet?.username, isAuthLoading: false, isInitialized: true });
      }
    };

    initializeUser();

    (window as any).setCurrentMockUser = (userId: string | null) => {
      if (!userId || userId.trim() === "") {
        logger.warn("setCurrentMockUser called with null or empty userId. Clearing current user and reloading.");
        localStorage.removeItem(MOCK_USER_STORAGE_KEY);
      } else {
        logger.info(`setCurrentMockUser called with ID: ${userId}. Storing in localStorage and reloading.`);
        localStorage.setItem(MOCK_USER_STORAGE_KEY, userId);
      }
      setIsInitialized(false);
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
        setIsInitialized(false);
        window.location.reload();
    };
    
    return () => {
        logger.info("useCurrentUser Effect: Cleanup function called (component unmount or dependency change). isInitialized was: " + isInitialized);
    };
  }, [isInitialized]);

  return {
    currentUser: isInitialized ? currentUser : null,
    isAuthLoading: !isInitialized || isAuthLoading
  };
}

export const hasPermission = (currentUser: CurrentUserContextValue | null, permissionId: PermissionId): boolean => {
  if (!currentUser || !currentUser.permissions || !Array.isArray(currentUser.permissions)) {
    return false;
  }
  const userHasPermission = currentUser.permissions.includes(permissionId);
  return userHasPermission;
};

