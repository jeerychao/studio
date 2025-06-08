
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
      PERMISSIONS.VIEW_QUERY_PAGE, // Added query page permission for guest for broader visibility by default
  ];
  let guestRoleName: RoleName = 'Viewer';

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
    if (isInitialized) {
      return;
    }

    const initializeUser = async () => {
      setIsAuthLoading(true);
      try {
        const storedUserId = localStorage.getItem(MOCK_USER_STORAGE_KEY);
        if (storedUserId) {
          logger.info(`useCurrentUser: Found storedUserId: ${storedUserId}. Fetching details...`);
          const userDetails = await fetchCurrentUserDetailsAction(storedUserId);
          if (userDetails) { 
            logger.info(`useCurrentUser: User details fetched for ${storedUserId}: ${userDetails.username}`);
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

    (window as any).setCurrentMockUser = (userId: string) => {
      logger.info(`setCurrentMockUser called with ID: ${userId}. Storing in localStorage and reloading.`);
      localStorage.setItem(MOCK_USER_STORAGE_KEY, userId);
      setIsInitialized(false); // Force re-initialization on reload
      window.location.reload();
    };

    (window as any).cycleMockUser = () => {
        const userCycleOrder = [
            'seed_user_admin', // Corrected IDs to match seed data
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
  }, [isInitialized]);

  return {
    currentUser: isInitialized ? currentUser : null,
    isAuthLoading: !isInitialized || isAuthLoading
  };
}

export const hasPermission = (currentUser: CurrentUserContextValue | null, permissionId: PermissionId): boolean => {
  if (!currentUser) {
    return false;
  }
  return currentUser.permissions.includes(permissionId);
};
