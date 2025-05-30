
"use client";

import type { User, Role, RoleName, PermissionId } from '@/types';
import { ADMIN_ROLE_ID, OPERATOR_ROLE_ID, VIEWER_ROLE_ID, mockUsers, mockRoles } from '@/lib/data';
import React from 'react';

// Ensure CurrentUserContextValue is correctly defined or imported
export interface CurrentUserContextValue extends User {
  roleName: RoleName;
  permissions: PermissionId[];
}

export const MOCK_USER_STORAGE_KEY = 'mock_current_user_id_v3'; // Export the key

const adminUser = mockUsers.find(u => u.roleId === ADMIN_ROLE_ID);
const operatorUser = mockUsers.find(u => u.roleId === OPERATOR_ROLE_ID);
const viewerUser = mockUsers.find(u => u.roleId === VIEWER_ROLE_ID);

// This value will be used for the initial render on the server,
// and for the *very first render on the client before useEffect runs*.
const SERVER_AND_INITIAL_CLIENT_USER_ID = adminUser?.id;

export function useCurrentUser(): CurrentUserContextValue {
  const [currentUserId, setCurrentUserId] = React.useState<string | undefined>(
    SERVER_AND_INITIAL_CLIENT_USER_ID
  );
  const [isClient, setIsClient] = React.useState(false);


  // This effect runs only on the client, after the initial render.
  React.useEffect(() => {
    setIsClient(true); // Indicate that we are now on the client
    const storedUserId = localStorage.getItem(MOCK_USER_STORAGE_KEY);
    
    if (storedUserId) {
      setCurrentUserId(storedUserId);
    } else {
      // If nothing in localStorage, set it to the default (admin) for next time
      if (SERVER_AND_INITIAL_CLIENT_USER_ID) {
        localStorage.setItem(MOCK_USER_STORAGE_KEY, SERVER_AND_INITIAL_CLIENT_USER_ID);
        setCurrentUserId(SERVER_AND_INITIAL_CLIENT_USER_ID);
      }
    }

    // Setup developer console tools
    (window as any).setCurrentMockUser = (userId: string) => {
      const userExists = mockUsers.find(u => u.id === userId);
      if (userExists) {
        localStorage.setItem(MOCK_USER_STORAGE_KEY, userId);
        window.location.reload();
      } else {
        console.error(`User with ID ${userId} not found in mockUsers. Available IDs: ${mockUsers.map(u => u.id).join(', ')}`);
      }
    };

    (window as any).cycleMockUser = () => {
        const rolesCycle = [adminUser?.id, operatorUser?.id, viewerUser?.id].filter(id => !!id) as string[];
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

  // During server render or initial client render (before useEffect runs), use the default.
  // Once isClient is true, use currentUserId (which might have been updated from localStorage).
  const userIdToLookup = isClient ? currentUserId : SERVER_AND_INITIAL_CLIENT_USER_ID;
  const userDataToUse = mockUsers.find(u => u.id === userIdToLookup);

  if (!userDataToUse) {
    const fallbackUser = adminUser || mockUsers[0]; 
    if (!fallbackUser) {
        const guestRole = mockRoles.find(r => r.id === VIEWER_ROLE_ID || r.name === 'Viewer');
        return { 
            id: 'guest-fallback', username: 'Guest', email: '', roleId: guestRole?.id || VIEWER_ROLE_ID,
            roleName: guestRole?.name || 'Viewer', permissions: guestRole?.permissions || [] 
        } as CurrentUserContextValue;
    }
    
    const fallbackRole = mockRoles.find(r => r.id === fallbackUser.roleId);
    if(!fallbackRole) throw new Error("Fallback user has no valid role.");
    
    return { ...fallbackUser, roleName: fallbackRole.name, permissions: fallbackRole.permissions };
  }

  const role = mockRoles.find(r => r.id === userDataToUse.roleId);
  if (!role) {
    console.error(`User ${userDataToUse.username} has an invalid roleId: ${userDataToUse.roleId}. Falling back to Viewer permissions.`);
    const viewerRole = mockRoles.find(r => r.id === VIEWER_ROLE_ID);
    return { ...userDataToUse, roleName: 'Viewer', permissions: viewerRole?.permissions || [] };
  }

  return { ...userDataToUse, roleName: role.name, permissions: role.permissions || [] };
}

// Helper to check if current user has a specific permission
export const hasPermission = (currentUser: CurrentUserContextValue | null, permissionId: PermissionId): boolean => {
  if (!currentUser) return false;
  return currentUser.permissions.includes(permissionId);
};
