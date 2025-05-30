
"use client";

import type { User, Role, RoleName, PermissionId } from '@/types';
import { ADMIN_ROLE_ID, OPERATOR_ROLE_ID, VIEWER_ROLE_ID, mockUsers, mockRoles } from '@/lib/data';
import React from 'react';

const MOCK_USER_STORAGE_KEY = 'mock_current_user_id_v3'; // Changed key to reset if old one exists

const adminUser = mockUsers.find(u => u.roleId === ADMIN_ROLE_ID);
const operatorUser = mockUsers.find(u => u.roleId === OPERATOR_ROLE_ID);
const viewerUser = mockUsers.find(u => u.roleId === VIEWER_ROLE_ID);

export interface CurrentUserContextValue extends User {
  roleName: RoleName;
  permissions: PermissionId[];
}

export function useCurrentUser(): CurrentUserContextValue {
  const [currentUserId, setCurrentUserId] = React.useState<string | undefined>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(MOCK_USER_STORAGE_KEY) || adminUser?.id;
    }
    return adminUser?.id; 
  });

  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      if (currentUserId) {
        localStorage.setItem(MOCK_USER_STORAGE_KEY, currentUserId);
      } else {
        localStorage.removeItem(MOCK_USER_STORAGE_KEY);
      }
    }
  }, [currentUserId]);

  if (typeof window !== 'undefined') {
    (window as any).setCurrentMockUser = (userId: string) => {
      const userExists = mockUsers.find(u => u.id === userId);
      if (userExists) {
        setCurrentUserId(userId);
        console.log(`Mock user set to ID: ${userId}. Refresh or navigate for all UI parts to update.`);
        window.location.reload(); // Force reload to ensure all components pick up the new user context
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
        const currentIndex = rolesCycle.indexOf(currentUserId || rolesCycle[0]);
        const nextIndex = (currentIndex + 1) % rolesCycle.length;
        setCurrentUserId(rolesCycle[nextIndex]);
        console.log(`Mock user cycled. New user ID: ${rolesCycle[nextIndex]}. Refresh or navigate.`);
        window.location.reload(); // Force reload
    };
    // const currentMockUserForDisplay = mockUsers.find(u => u.id === currentUserId);
    // console.log(`Mock auth: Current user ID: ${currentUserId}. Use setCurrentMockUser('user-id') or cycleMockUser() in console to change.`);
  }

  const currentUserData = mockUsers.find(u => u.id === currentUserId);

  if (!currentUserData) {
    const fallbackUser = adminUser || mockUsers[0]; 
    if (!fallbackUser) throw new Error("No mock users available for fallback.");
    
    const fallbackRole = mockRoles.find(r => r.id === fallbackUser.roleId);
    if(!fallbackRole) throw new Error("Fallback user has no valid role.");

    console.warn("Current user ID not found, falling back to admin user for hook.");
    return { ...fallbackUser, roleName: fallbackRole.name, permissions: fallbackRole.permissions };
  }

  const role = mockRoles.find(r => r.id === currentUserData.roleId);
  if (!role) {
    console.error(`User ${currentUserData.username} has an invalid roleId: ${currentUserData.roleId}. Falling back to Viewer permissions.`);
    const viewerRole = mockRoles.find(r => r.id === VIEWER_ROLE_ID);
    return { ...currentUserData, roleName: 'Viewer', permissions: viewerRole?.permissions || [] };
  }

  return { ...currentUserData, roleName: role.name, permissions: role.permissions || [] };
}

// Helper to check if current user has a specific permission
export const hasPermission = (currentUser: CurrentUserContextValue | null, permissionId: PermissionId): boolean => {
  if (!currentUser) return false;
  return currentUser.permissions.includes(permissionId);
};
