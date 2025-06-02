
"use client";

import type { User, RoleName, PermissionId } from '@/types';
import { ADMIN_ROLE_ID, OPERATOR_ROLE_ID, VIEWER_ROLE_ID, mockUsers, mockRoles } from '../lib/data'; // Adjusted path
import React from 'react';

export interface CurrentUserContextValue extends User {
  roleName: RoleName;
  permissions: PermissionId[];
}

export const MOCK_USER_STORAGE_KEY = 'mock_current_user_id_v3_prisma';

// This constant is still useful for development (e.g. `cycleMockUser`) but won't be used for initial pre-client state.
const SERVER_AND_INITIAL_CLIENT_USER_ID = mockUsers.find(u => u.roleId === ADMIN_ROLE_ID)?.id || mockUsers[0]?.id;


export function useCurrentUser(): CurrentUserContextValue {
  const [currentUserId, setCurrentUserId] = React.useState<string | undefined>();
  const [isClient, setIsClient] = React.useState(false);

  React.useEffect(() => {
    setIsClient(true);
    const storedUserId = localStorage.getItem(MOCK_USER_STORAGE_KEY);
    
    if (storedUserId && mockUsers.find(u => u.id === storedUserId)) {
      setCurrentUserId(storedUserId);
    } else {
      localStorage.removeItem(MOCK_USER_STORAGE_KEY); 
      setCurrentUserId(undefined); 
    }

    (window as any).setCurrentMockUser = (userId: string) => {
      const userExists = mockUsers.find(u => u.id === userId);
      if (userExists) {
        localStorage.setItem(MOCK_USER_STORAGE_KEY, userId);
        window.location.reload();
      } else {
        console.error(`User with ID ${userId} not found in mockUsers (used for dev switching). Available IDs: ${mockUsers.map(u => u.id).join(', ')}`);
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
        
        const currentCycleIdInStorage = localStorage.getItem(MOCK_USER_STORAGE_KEY) || SERVER_AND_INITIAL_CLIENT_USER_ID || rolesCycle[0];
        const currentIndex = rolesCycle.indexOf(currentCycleIdInStorage);
        const nextUserId = rolesCycle[(currentIndex + 1) % rolesCycle.length];
        
        localStorage.setItem(MOCK_USER_STORAGE_KEY, nextUserId);
        window.location.reload();
    };
  }, []); 

  const currentUserValue = React.useMemo(() => {
    if (!isClient) {
      // Before client-side hydration, or on server, return a guest user.
      // This prevents the login page from redirecting away prematurely.
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
    }

    // If isClient is true, rely on currentUserId derived from localStorage
    let userDataToUse = mockUsers.find(u => u.id === currentUserId);

    if (!userDataToUse) { // currentUserId was undefined or not found
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
    }

    // Valid user found based on currentUserId from localStorage
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
  }, [isClient, currentUserId]);

  return currentUserValue;
}

export const hasPermission = (currentUser: CurrentUserContextValue | null, permissionId: PermissionId): boolean => {
  if (!currentUser) return false;
  return currentUser.permissions.includes(permissionId);
};
