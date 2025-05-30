
"use client";

import type { User, Role, RoleName, PermissionId } from '@/types';
import { ADMIN_ROLE_ID, OPERATOR_ROLE_ID, VIEWER_ROLE_ID, mockUsers, mockRoles } from '@/lib/data';
import React from 'react';

// Ensure CurrentUserContextValue is correctly defined or imported
export interface CurrentUserContextValue extends User {
  roleName: RoleName;
  permissions: PermissionId[];
}

const MOCK_USER_STORAGE_KEY = 'mock_current_user_id_v3';

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

  // This effect runs only on the client, after the initial render.
  React.useEffect(() => {
    const storedUserId = localStorage.getItem(MOCK_USER_STORAGE_KEY);
    // If localStorage has a value and it's different from the current state, update.
    if (storedUserId && storedUserId !== currentUserId) {
      setCurrentUserId(storedUserId);
    }

    // Setup developer console tools
    (window as any).setCurrentMockUser = (userId: string) => {
      const userExists = mockUsers.find(u => u.id === userId);
      if (userExists) {
        localStorage.setItem(MOCK_USER_STORAGE_KEY, userId);
        // Reloading will cause useEffect to pick up the new localStorage value
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
        // Determine current user from localStorage for cycling logic, default to initial if not found
        const currentCycleIdInStorage = localStorage.getItem(MOCK_USER_STORAGE_KEY) || SERVER_AND_INITIAL_CLIENT_USER_ID;
        const currentIndex = rolesCycle.indexOf(currentCycleIdInStorage || rolesCycle[0]);
        const nextUserId = rolesCycle[(currentIndex + 1) % rolesCycle.length];
        
        localStorage.setItem(MOCK_USER_STORAGE_KEY, nextUserId);
        window.location.reload();
    };
  }, []); // Empty dependency array ensures this runs once on client mount.
            // currentUserId was removed from deps to avoid potential loops if dev tools were called weirdly.
            // The primary goal is to sync from localStorage ONCE on mount.

  const userDataToUse = mockUsers.find(u => u.id === currentUserId);

  if (!userDataToUse) {
    const fallbackUser = adminUser || mockUsers[0]; 
    if (!fallbackUser) {
        // This should ideally not be reached if adminUser always exists.
        // Return a "guest" or minimal permission state.
        const guestRole = mockRoles.find(r => r.id === VIEWER_ROLE_ID || r.name === 'Viewer');
        return { 
            id: 'guest-fallback', username: 'Guest', email: '', roleId: guestRole?.id || VIEWER_ROLE_ID,
            roleName: guestRole?.name || 'Viewer', permissions: guestRole?.permissions || [] 
        } as CurrentUserContextValue;
    }
    
    const fallbackRole = mockRoles.find(r => r.id === fallbackUser.roleId);
    if(!fallbackRole) throw new Error("Fallback user has no valid role.");

    // console.warn(`Current user ID (${currentUserId}) not found or not yet resolved from client storage, falling back to admin user for hook.`);
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
