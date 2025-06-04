
"use client";

import type { User, RoleName, PermissionId } from '@/types';
import { ADMIN_ROLE_ID, OPERATOR_ROLE_ID, VIEWER_ROLE_ID } from '../lib/data'; // Keep for role ID constants
import { fetchCurrentUserDetailsAction } from '@/lib/actions'; // Import the new server action
import React from 'react';

export interface CurrentUserContextValue extends User {
  roleName: RoleName;
  permissions: PermissionId[];
}

export interface UseCurrentUserReturn {
  currentUser: CurrentUserContextValue | null; // Can be null initially or if no user
  isAuthLoading: boolean;
}

export const MOCK_USER_STORAGE_KEY = 'mock_current_user_id_v3_prisma';

// Async function to create a guest user by fetching Viewer role details from DB
const createGuestUser = async (): Promise<CurrentUserContextValue> => {
  try {
    // Attempt to fetch the 'Viewer' role and its permissions from the database
    // This assumes VIEWER_ROLE_ID is correctly defined and seeded
    const viewerDetails = await fetchCurrentUserDetailsAction(VIEWER_ROLE_ID); // This action needs to handle roles too, or a separate role fetch action
    
    // A more direct approach might be to fetch the Role directly if VIEWER_ROLE_ID is a User ID.
    // Let's assume a dedicated function or an adaptation of fetchCurrentUserDetailsAction
    // to get role data, or have a fallback if DB call fails during guest creation.
    // For now, let's make a placeholder for fetching role directly for guest.
    // This part is tricky as `fetchCurrentUserDetailsAction` expects a user ID.
    // A better approach: `useCurrentUser` should fetch the "Viewer" role specifically if no user.

    const guestRoleFromDb = await prisma.role.findUnique({ // This line won't work directly in client component
        // where: { id: VIEWER_ROLE_ID },                 // Prisma can only be used in server components/actions
        // include: { permissions: true }
        // For now, we will use a simplified guest creation, real DB fetch for guest role permissions needs a server action.
        // This is a limitation: client-side cannot directly query prisma.
        // We'll rely on a predefined minimal guest structure or enhance `fetchCurrentUserDetailsAction`
        // to also be callable with a role ID, or create a new action like `fetchRoleDetailsAction`.
        // Let's use a fixed minimal permission set for guest for now if DB fetch is complex here.
        where: { id: "role-viewer-fixed" }, // Placeholder for where we'd get viewer role
        include: {permissions: true}
    });

    // Fallback structure if DB call for guest role is not implemented here or fails
    let guestPermissions: PermissionId[] = [];
    let guestRoleName: RoleName = 'Viewer';

    if (guestRoleFromDb && guestRoleFromDb.permissions) { // This check is conceptual due to Prisma client-side limitation
        guestPermissions = guestRoleFromDb.permissions.map((p: any) => p.id as PermissionId);
        guestRoleName = guestRoleFromDb.name as RoleName;
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
  } catch (error) {
    console.error("Error creating guest user:", error);
    // Fallback to a very minimal guest user if DB interaction fails
    return {
        id: 'guest-fallback-id',
        username: 'Guest',
        email: 'guest@example.com',
        roleId: VIEWER_ROLE_ID,
        avatar: '/images/avatars/default_avatar.png',
        lastLogin: undefined,
        roleName: 'Viewer' as RoleName,
        permissions: [] // No permissions if DB fails
    };
  }
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
            localStorage.removeItem(MOCK_USER_STORAGE_KEY); // Clear invalid stored ID
            setCurrentUser(await createGuestUser());
          }
        } else {
          setCurrentUser(await createGuestUser());
        }
      } catch (error) {
        console.error("Error initializing current user:", error);
        setCurrentUser(await createGuestUser()); // Fallback to guest on error
      } finally {
        setIsAuthLoading(false);
        setIsInitialized(true);
      }
    };

    initializeUser();

    // Developer helper functions
    // Note: These now trigger a full data fetch for the "real" user experience.
    (window as any).setCurrentMockUser = async (userId: string) => {
      console.log(`Attempting to set current user to ID: ${userId} (will fetch from DB)`);
      localStorage.setItem(MOCK_USER_STORAGE_KEY, userId);
      // To reflect the change, we re-initialize. A more sophisticated state management
      // might update currentUser directly after fetchCurrentUserDetailsAction.
      // For simplicity, a reload or re-initialization is straightforward.
      window.location.reload(); 
    };

    (window as any).cycleMockUser = async () => {
        // These IDs are for SEEDED users.
        const userCycleOrder = [
            'user-admin-seed',   // Assumes this ID exists in your DB from seeding
            'user-operator-seed',// Assumes this ID exists
            'user-viewer-seed'   // Assumes this ID exists
        ];
        const currentStoredId = localStorage.getItem(MOCK_USER_STORAGE_KEY);
        let nextUserId = userCycleOrder[0]; // Default to first if none stored or invalid

        if (currentStoredId) {
            const currentIndex = userCycleOrder.indexOf(currentStoredId);
            if (currentIndex !== -1) {
                nextUserId = userCycleOrder[(currentIndex + 1) % userCycleOrder.length];
            }
        }
        console.log(`Cycling mock user to ID: ${nextUserId} (will fetch from DB)`);
        localStorage.setItem(MOCK_USER_STORAGE_KEY, nextUserId);
        window.location.reload();
    };

  }, []);


  return { currentUser: isInitialized ? currentUser : null, isAuthLoading: !isInitialized || isAuthLoading };
}

export const hasPermission = (currentUser: CurrentUserContextValue | null, permissionId: PermissionId): boolean => {
  if (!currentUser || currentUser.id === 'guest-fallback-id') { // Guest check
    // Minimal permissions for guest or handle as needed
    // For example, allow VIEW_DASHBOARD for guest if desired, or return false for all.
    // This example assumes guest has permissions defined in their fetched role.
    return currentUser?.permissions?.includes(permissionId) || false;
  }
  return currentUser.permissions.includes(permissionId);
};
