
"use client";

import type { User, RoleName, PermissionId } from '@/types';
import { PERMISSIONS } from '@/types'; // Import PERMISSIONS for guest user
import { ADMIN_ROLE_ID, OPERATOR_ROLE_ID, VIEWER_ROLE_ID } from '../lib/data';
import { fetchCurrentUserDetailsAction } from '@/lib/actions';
import React from 'react';

export interface CurrentUserContextValue extends User {
  roleName: RoleName;
  permissions: PermissionId[];
}

export interface UseCurrentUserReturn {
  currentUser: CurrentUserContextValue | null;
  isAuthLoading: boolean;
}

export const MOCK_USER_STORAGE_KEY = 'mock_current_user_id_v3_prisma_real_data';

const createGuestUser = async (): Promise<CurrentUserContextValue> => {
  // For a true guest experience, you might fetch a "Viewer" role's permissions from the DB.
  // Here, we'll use a predefined set for simplicity, assuming VIEWER_ROLE_ID exists.
  // Or, even better, fetch the "Viewer" role by its known ID using a dedicated action if necessary.
  // For now, a simplified guest:
  let guestPermissions: PermissionId[] = [
      PERMISSIONS.VIEW_DASHBOARD,
      PERMISSIONS.VIEW_SUBNET,
      PERMISSIONS.VIEW_VLAN,
      PERMISSIONS.VIEW_IPADDRESS,
      PERMISSIONS.VIEW_AUDIT_LOG,
  ];
  let guestRoleName: RoleName = 'Viewer';

  try {
    // Attempt to get more precise guest role details from the default "Viewer" role ID
    // This assumes fetchCurrentUserDetailsAction can be adapted or a new action exists
    // for fetching role-specific permissions if VIEWER_ROLE_ID is a user ID placeholder
    // or VIEWER_ROLE_ID is the actual role ID for "Viewer".
    // If fetchCurrentUserDetailsAction is strictly for users, this part would need a different action.
    // For this example, we'll assume Viewer role ID is known and we might fetch its permissions.
    // Given VIEWER_ROLE_ID is likely a Role ID, a more direct role fetch would be needed.
    // We'll stick to predefined permissions if a direct role fetch action isn't readily available.
  } catch (e) {
    console.warn("Could not fetch precise guest role permissions, using defaults.", e);
  }

  return {
      id: 'guest-fallback-id',
      username: 'Guest',
      email: 'guest@example.com',
      roleId: VIEWER_ROLE_ID, // This should be the ID of the "Viewer" role
      avatar: '/images/avatars/default_avatar.png', // Default local avatar
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
    const initializeUser = async () => {
      setIsAuthLoading(true);
      try {
        const storedUserId = localStorage.getItem(MOCK_USER_STORAGE_KEY);
        if (storedUserId) {
          const userDetails = await fetchCurrentUserDetailsAction(storedUserId);
          if (userDetails) {
            setCurrentUser(userDetails);
          } else {
            console.warn(`User details not found for stored ID ${storedUserId}. Clearing and using guest.`);
            localStorage.removeItem(MOCK_USER_STORAGE_KEY);
            setCurrentUser(await createGuestUser());
          }
        } else {
          setCurrentUser(await createGuestUser());
        }
      } catch (error) {
        console.error("Error initializing current user:", error);
        setCurrentUser(await createGuestUser());
      } finally {
        setIsAuthLoading(false);
        setIsInitialized(true);
      }
    };

    initializeUser();

    (window as any).setCurrentMockUser = async (userId: string) => {
      console.log(`Setting current user to ID: ${userId} (will fetch from DB and reload)`);
      localStorage.setItem(MOCK_USER_STORAGE_KEY, userId);
      window.location.reload();
    };

    (window as any).cycleMockUser = async () => {
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
        window.location.reload();
    };

  }, []);


  return { currentUser: isInitialized ? currentUser : null, isAuthLoading: !isInitialized || isAuthLoading };
}

export const hasPermission = (currentUser: CurrentUserContextValue | null, permissionId: PermissionId): boolean => {
  if (!currentUser) {
    return false; // No user, no permissions
  }
  // Guest user permissions are now part of their fetched/defined CurrentUserContextValue
  return currentUser.permissions.includes(permissionId);
};
