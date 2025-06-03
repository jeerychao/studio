
"use client";

import type { User, RoleName, PermissionId } from '@/types';
import { ADMIN_ROLE_ID, OPERATOR_ROLE_ID, VIEWER_ROLE_ID, mockUsers, mockRoles } from '../lib/data';
import React from 'react';

export interface CurrentUserContextValue extends User {
  roleName: RoleName;
  permissions: PermissionId[];
}

export interface UseCurrentUserReturn {
  currentUser: CurrentUserContextValue;
  isAuthLoading: boolean;
}

export const MOCK_USER_STORAGE_KEY = 'mock_current_user_id_v3_prisma';

const createGuestUser = (): CurrentUserContextValue => {
  const guestRoleData = mockRoles.find(r => r.id === VIEWER_ROLE_ID || r.name === 'Viewer');
  return {
      id: 'guest-fallback-id',
      username: 'Guest',
      email: 'guest@example.com',
      roleId: guestRoleData?.id || VIEWER_ROLE_ID,
      avatar: undefined,
      lastLogin: undefined,
      roleName: guestRoleData?.name || ('Viewer' as RoleName),
      permissions: guestRoleData?.permissions || []
  };
};

export function useCurrentUser(): UseCurrentUserReturn {
  const [currentUserId, setCurrentUserId] = React.useState<string | undefined>();
  const [isInitialized, setIsInitialized] = React.useState(false); // Key state for client-side init

  React.useEffect(() => {
    // This effect runs only on the client, after the initial mount.
    try {
      const storedUserId = localStorage.getItem(MOCK_USER_STORAGE_KEY);
      if (storedUserId && mockUsers.find(u => u.id === storedUserId)) {
        setCurrentUserId(storedUserId);
      } else {
        localStorage.removeItem(MOCK_USER_STORAGE_KEY); // Ensure it's clean if invalid
        setCurrentUserId(undefined);
      }

      // Define window functions for dev purposes
      // These are set up once the hook is active on the client.
      (window as any).setCurrentMockUser = (userId: string) => {
        const userExists = mockUsers.find(u => u.id === userId);
        if (userExists) {
          localStorage.setItem(MOCK_USER_STORAGE_KEY, userId);
          setCurrentUserId(userId); 
        } else {
          console.error(`User with ID ${userId} not found in mockUsers. Available IDs: ${mockUsers.map(u => u.id).join(', ')}`);
        }
      };

      (window as any).cycleMockUser = () => {
          const adminUserSeed = mockUsers.find(u => u.roleId === ADMIN_ROLE_ID);
          const operatorUserSeed = mockUsers.find(u => u.roleId === OPERATOR_ROLE_ID);
          const viewerUserSeed = mockUsers.find(u => u.roleId === VIEWER_ROLE_ID);
          const rolesCycle = [adminUserSeed?.id, operatorUserSeed?.id, viewerUserSeed?.id].filter(id => !!id) as string[];

          if (rolesCycle.length === 0) {
              console.error("No mock users found for cycling.");
              return;
          }

          const currentCycleIdInStorage = localStorage.getItem(MOCK_USER_STORAGE_KEY) || mockUsers[0]?.id || rolesCycle[0];
          const currentIndex = rolesCycle.indexOf(currentCycleIdInStorage);
          const nextUserId = rolesCycle[(currentIndex + 1) % rolesCycle.length];

          localStorage.setItem(MOCK_USER_STORAGE_KEY, nextUserId);
          window.location.reload(); 
      };
    } catch (error) {
        console.error("Error during useCurrentUser initialization (useEffect):", error);
        // Even if there's an error, we should mark as initialized to not block indefinitely
    } finally {
        setIsInitialized(true); // Mark as initialized AFTER localStorage is processed
    }
  }, []); // Empty dependency array ensures this runs once on client mount

  const isAuthLoading = !isInitialized;

  const currentUserValue = React.useMemo(() => {
    if (isAuthLoading) {
      return createGuestUser();
    }

    let userDataToUse = mockUsers.find(u => u.id === currentUserId);
    if (!userDataToUse) {
      return createGuestUser(); 
    }

    const role = mockRoles.find(r => r.id === userDataToUse.roleId);
    if (!role) {
      console.error(`User ${userDataToUse.username} has an invalid roleId: ${userDataToUse.roleId}. Falling back to Viewer permissions.`);
      const viewerRoleData = mockRoles.find(r => r.id === VIEWER_ROLE_ID || r.name === 'Viewer');
      return {
        ...userDataToUse,
        roleName: ('Viewer' as RoleName),
        permissions: viewerRoleData?.permissions || []
      };
    }
    return { ...userDataToUse, roleName: role.name, permissions: role.permissions || [] };
  }, [isAuthLoading, currentUserId]); 

  return { currentUser: currentUserValue, isAuthLoading };
}

export const hasPermission = (currentUser: CurrentUserContextValue | null, permissionId: PermissionId): boolean => {
  if (!currentUser) return false;
  return currentUser.permissions.includes(permissionId);
};
