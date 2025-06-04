
"use client";

import type { User, RoleName, PermissionId } from '@/types';
import { PERMISSIONS } from '@/types';
import { ADMIN_ROLE_ID, OPERATOR_ROLE_ID, VIEWER_ROLE_ID } from '../lib/data';
import { fetchCurrentUserDetailsAction, type FetchedUserDetails } from '@/lib/actions'; // Import FetchedUserDetails
import React from 'react';

// Redefined CurrentUserContextValue to be explicit and not extend User directly
// to avoid confusion with User's optional roleName.
export interface CurrentUserContextValue {
  id: string;
  username: string;
  email: string;
  roleId: string;
  avatar?: string;
  lastLogin?: string | undefined;
  roleName: RoleName; // Explicitly non-optional
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
          console.log(`useCurrentUser: Found storedUserId: ${storedUserId}. Fetching details...`);
          // userDetails will be of type FetchedUserDetails | null
          const userDetails = await fetchCurrentUserDetailsAction(storedUserId);
          if (userDetails) { // userDetails is now FetchedUserDetails (which has non-optional roleName)
            console.log(`useCurrentUser: User details fetched for ${storedUserId}:`, userDetails.username);
            // This assignment should now be type-compatible
            setCurrentUser(userDetails);
          } else {
            console.warn(`useCurrentUser: User details not found for stored ID ${storedUserId}. Clearing and using guest.`);
            localStorage.removeItem(MOCK_USER_STORAGE_KEY);
            setCurrentUser(await createGuestUser());
          }
        } else {
          console.log("useCurrentUser: No storedUserId found. Using guest user.");
          setCurrentUser(await createGuestUser());
        }
      } catch (error) {
        console.error("useCurrentUser: Error initializing current user:", error);
        setCurrentUser(await createGuestUser());
      } finally {
        setIsAuthLoading(false);
        setIsInitialized(true);
        console.log("useCurrentUser: Initialization complete.");
      }
    };

    initializeUser();

    (window as any).setCurrentMockUser = (userId: string) => {
      console.log(`Setting current user to ID: ${userId} (will fetch from DB and reload)`);
      localStorage.setItem(MOCK_USER_STORAGE_KEY, userId);
      setIsInitialized(false);
      window.location.reload();
    };

    (window as any).cycleMockUser = () => {
        const userCycleOrder = [
            'user-admin-seed',
            'user-operator-seed',
            'user-viewer-seed'
        ];
        const currentStoredId = localStorage.getItem(MOCK_USER_STORAGE_KEY);
        let nextUserId = userCycleOrder[0];

        if (currentStoredId) {
            const currentIndex = userCycleOrder.indexOf(currentStoredId);
            if (currentIndex !== -1) {
                nextUserId = userCycleOrder[(currentIndex + 1) % userCycleOrder.length];
            }
        }
        console.log(`Cycling mock user to ID: ${nextUserId} (will fetch from DB and reload)`);
        localStorage.setItem(MOCK_USER_STORAGE_KEY, nextUserId);
        setIsInitialized(false);
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
