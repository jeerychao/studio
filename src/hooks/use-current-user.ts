
"use client";

import type { User, RoleName, PermissionId } from '@/types';
import { ADMIN_ROLE_ID, OPERATOR_ROLE_ID, VIEWER_ROLE_ID, mockUsers, mockRoles } from '@/lib/data';
import React from 'react';

export interface CurrentUserContextValue extends User {
  roleName: RoleName;
  permissions: PermissionId[];
}

export const MOCK_USER_STORAGE_KEY = 'mock_current_user_id_v3_prisma';

const adminUserSeed = mockUsers.find(u => u.roleId === ADMIN_ROLE_ID);
const operatorUserSeed = mockUsers.find(u => u.roleId === OPERATOR_ROLE_ID);
const viewerUserSeed = mockUsers.find(u => u.roleId === VIEWER_ROLE_ID);

const SERVER_AND_INITIAL_CLIENT_USER_ID = adminUserSeed?.id || operatorUserSeed?.id || viewerUserSeed?.id || mockUsers[0]?.id;


export function useCurrentUser(): CurrentUserContextValue {
  const [currentUserId, setCurrentUserId] = React.useState<string | undefined>(
    SERVER_AND_INITIAL_CLIENT_USER_ID
  );
  const [isClient, setIsClient] = React.useState(false);

  React.useEffect(() => {
    setIsClient(true);
    const storedUserId = localStorage.getItem(MOCK_USER_STORAGE_KEY);
    
    if (storedUserId && mockUsers.find(u => u.id === storedUserId)) {
      setCurrentUserId(storedUserId);
    } else {
      if (SERVER_AND_INITIAL_CLIENT_USER_ID) {
        localStorage.setItem(MOCK_USER_STORAGE_KEY, SERVER_AND_INITIAL_CLIENT_USER_ID);
        setCurrentUserId(SERVER_AND_INITIAL_CLIENT_USER_ID);
      }
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
    const userIdToLookup = isClient ? currentUserId : SERVER_AND_INITIAL_CLIENT_USER_ID;
    let userDataToUse = mockUsers.find(u => u.id === userIdToLookup);

    if (!userDataToUse) {
      const fallbackUserFromSeed = adminUserSeed || operatorUserSeed || viewerUserSeed || mockUsers[0];
      if (!fallbackUserFromSeed) { 
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
      userDataToUse = fallbackUserFromSeed; // Use this as the base for the fallback
    }

    // userDataToUse is now guaranteed to be a User object (either found or a fallback from mockUsers)
    const role = mockRoles.find(r => r.id === userDataToUse!.roleId);
    if (!role) {
      console.error(`User ${userDataToUse!.username} has an invalid roleId: ${userDataToUse!.roleId}. Falling back to Viewer permissions.`);
      const viewerRoleData = mockRoles.find(r => r.id === VIEWER_ROLE_ID || r.name === 'Viewer');
      return { 
        ...userDataToUse!, 
        roleName: ('Viewer' as RoleName), 
        permissions: viewerRoleData?.permissions || [] 
      };
    }

    return { ...userDataToUse!, roleName: role.name, permissions: role.permissions || [] };
  }, [isClient, currentUserId]); // Dependencies for the memoized value

  return currentUserValue;
}

export const hasPermission = (currentUser: CurrentUserContextValue | null, permissionId: PermissionId): boolean => {
  if (!currentUser) return false;
  return currentUser.permissions.includes(permissionId);
};
