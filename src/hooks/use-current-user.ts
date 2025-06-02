
"use client";

import type { User, RoleName, PermissionId } from '@/types';
// The mockUsers and mockRoles are now primarily for the dev switching mechanism.
// The actual permissions and role names for a given user ID should ideally be fetched
// from the DB in a real scenario, or the mock data here must be kept in sync with seed data.
import { ADMIN_ROLE_ID, OPERATOR_ROLE_ID, VIEWER_ROLE_ID, mockUsers, mockRoles } from '@/lib/data';
import React from 'react';

export interface CurrentUserContextValue extends User {
  roleName: RoleName;
  permissions: PermissionId[];
}

export const MOCK_USER_STORAGE_KEY = 'mock_current_user_id_v3_prisma';

// Attempt to find users from the (seed-representative) mockUsers array
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

  const userIdToLookup = isClient ? currentUserId : SERVER_AND_INITIAL_CLIENT_USER_ID;
  // userDataToUse relies on mockUsers from data.ts which should reflect seeded data
  const userDataToUse = mockUsers.find(u => u.id === userIdToLookup);

  if (!userDataToUse) {
    // Fallback logic if user somehow not found in mockUsers
    const fallbackUser = adminUserSeed || mockUsers[0];
    if (!fallbackUser) { // Should not happen if mockUsers is populated
        const guestRoleData = mockRoles.find(r => r.id === VIEWER_ROLE_ID || r.name === 'Viewer');
        return { 
            id: 'guest-fallback-id', username: 'Guest', email: 'guest@example.com', roleId: guestRoleData?.id || VIEWER_ROLE_ID,
            roleName: guestRoleData?.name || 'Viewer', permissions: guestRoleData?.permissions || [] 
        } as CurrentUserContextValue;
    }
    const fallbackRole = mockRoles.find(r => r.id === fallbackUser.roleId);
    if (!fallbackRole) throw new Error("Fallback user has no valid role in mockRoles.");
    return { ...fallbackUser, roleName: fallbackRole.name, permissions: fallbackRole.permissions };
  }

  // role relies on mockRoles from data.ts
  const role = mockRoles.find(r => r.id === userDataToUse.roleId);
  if (!role) {
    console.error(`User ${userDataToUse.username} has an invalid roleId in mockUsers: ${userDataToUse.roleId}. Falling back to Viewer permissions.`);
    const viewerRoleData = mockRoles.find(r => r.id === VIEWER_ROLE_ID);
    return { ...userDataToUse, roleName: 'Viewer', permissions: viewerRoleData?.permissions || [] };
  }

  return { ...userDataToUse, roleName: role.name, permissions: role.permissions || [] };
}

export const hasPermission = (currentUser: CurrentUserContextValue | null, permissionId: PermissionId): boolean => {
  if (!currentUser) return false;
  // Permissions are sourced from the mockRoles array for the client-side context
  return currentUser.permissions.includes(permissionId);
};
