
"use client";

import type { User, RoleName } from '@/types';
import { ADMIN_ROLE_ID, OPERATOR_ROLE_ID, VIEWER_ROLE_ID, mockUsers, mockRoles } from '@/lib/data';
import React from 'react';

// Helper to find role name from roleId
const getRoleNameById = (roleId: string): RoleName | undefined => {
  const role = mockRoles.find(r => r.id === roleId);
  return role?.name;
};

const MOCK_USER_STORAGE_KEY = 'mock_current_user_id_v2'; // Changed key to reset if old one exists

// Find users by role ID for easier switching in demo
const adminUser = mockUsers.find(u => u.roleId === ADMIN_ROLE_ID);
const operatorUser = mockUsers.find(u => u.roleId === OPERATOR_ROLE_ID);
const viewerUser = mockUsers.find(u => u.roleId === VIEWER_ROLE_ID);

export function useCurrentUser(): User & { roleName: RoleName } {
  const [currentUserId, setCurrentUserId] = React.useState<string | undefined>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(MOCK_USER_STORAGE_KEY) || adminUser?.id;
    }
    return adminUser?.id; // Default to admin
  });

  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      if (currentUserId) {
        localStorage.setItem(MOCK_USER_STORAGE_KEY, currentUserId);
      } else {
        // If currentUserId becomes undefined (shouldn't happen with default), clear storage
        localStorage.removeItem(MOCK_USER_STORAGE_KEY);
      }
    }
  }, [currentUserId]);

  if (typeof window !== 'undefined') {
    (window as any).setCurrentMockUser = (userId: string) => {
      const userExists = mockUsers.find(u => u.id === userId);
      if (userExists) {
        setCurrentUserId(userId);
        // Instead of reload, which might be jarring, let React's state update propagate.
        // UI relying on this hook should re-render.
        // Forcing a reload might be needed if some components don't re-render properly on context/hook changes alone.
        // Consider a more sophisticated state management or event bus for complex scenarios.
        console.log(`Mock user set to ID: ${userId}. You might need to manually refresh or navigate for all UI parts to update if they don't use this hook directly.`);
        // window.location.reload(); 
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
        console.log(`Mock user cycled. New user ID: ${rolesCycle[nextIndex]}. You might need to manually refresh or navigate.`);
        // window.location.reload();
    };
    const currentMockUserForDisplay = mockUsers.find(u => u.id === currentUserId);
    console.log(`Mock auth: Current user is ${currentMockUserForDisplay?.username} (ID: ${currentUserId}, Role: ${getRoleNameById(currentMockUserForDisplay?.roleId || '')}). Use setCurrentMockUser('user-id') or cycleMockUser() in console to change.`);
  }

  const currentUser = mockUsers.find(u => u.id === currentUserId);

  if (!currentUser) {
    const fallbackUser = adminUser || mockUsers[0]; 
    if (!fallbackUser) throw new Error("No mock users available for fallback.");
    const fallbackRoleName = getRoleNameById(fallbackUser.roleId);
    if(!fallbackRoleName) throw new Error("Fallback user has no valid role name.");
    console.warn("Current user ID not found, falling back to admin user for hook.");
    return { ...fallbackUser, roleName: fallbackRoleName };
  }

  const roleName = getRoleNameById(currentUser.roleId);
  if (!roleName) {
    console.error(`User ${currentUser.username} has an invalid roleId: ${currentUser.roleId}`);
    return { ...currentUser, roleName: 'Viewer' }; // Fallback to least privileged
  }

  return { ...currentUser, roleName };
}

// Utility functions to check permissions
export const canManageUsers = (roleName: RoleName): boolean => roleName === 'Administrator';
export const canManageSettings = (roleName: RoleName): boolean => roleName === 'Administrator'; // e.g. Tools, Audit Logs
export const canEditIpResources = (roleName: RoleName): boolean => roleName === 'Administrator' || roleName === 'Operator';
export const canViewIpResources = (roleName: RoleName): boolean => roleName === 'Administrator' || roleName === 'Operator' || roleName === 'Viewer';

