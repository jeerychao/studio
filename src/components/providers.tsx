"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ThemeProviderProps } from "next-themes/dist/types";
import { Toaster } from "@/components/ui/toaster";

// Imports for CurrentUserProvider
import { CurrentUserContext, MOCK_USER_STORAGE_KEY, type CurrentUserContextValue } from "@/hooks/use-current-user";
import { fetchCurrentUserDetailsAction } from '@/lib/actions';
import { logger } from '@/lib/logger';
import { useState, useEffect, useMemo, useRef } from 'react';

// The CurrentUserProvider component is now defined here
const CurrentUserProvider = ({ children }: { children: React.ReactNode }) => {
  const [currentUser, setCurrentUser] = useState<CurrentUserContextValue | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const isInitializedRef = useRef(false);

  useEffect(() => {
    if (isInitializedRef.current) {
      return;
    }
    isInitializedRef.current = true;

    const initializeUser = async () => {
      setIsAuthLoading(true);
      let userToSet: CurrentUserContextValue | null = null;
      try {
        const storedUserId = localStorage.getItem(MOCK_USER_STORAGE_KEY);
        if (storedUserId) {
          logger.debug(`CurrentUserProvider: Found storedUserId: ${storedUserId}. Fetching details...`);
          const userDetails = await fetchCurrentUserDetailsAction(storedUserId);

          if (userDetails) {
            logger.debug(`CurrentUserProvider: User details fetched for ${userDetails.username}.`);
            userToSet = {
              ...userDetails,
              permissions: userDetails.permissions || [],
            };
          } else {
            logger.warn(`CurrentUserProvider: User details not found for stored ID "${storedUserId}". Clearing storage.`);
            localStorage.removeItem(MOCK_USER_STORAGE_KEY);
            userToSet = null;
          }
        } else {
          logger.debug("CurrentUserProvider: No storedUserId found. User is not authenticated.");
          userToSet = null;
        }
      } catch (error) {
        logger.error("CurrentUserProvider: Error during user initialization.", error as Error);
        userToSet = null;
      } finally {
        setCurrentUser(userToSet);
        setIsAuthLoading(false);
        logger.debug("CurrentUserProvider: Initialization complete.", { userSet: userToSet ? userToSet.username : 'null' });
      }
    };

    initializeUser();

    if (!(window as any).setCurrentMockUser) {
        (window as any).setCurrentMockUser = (userId: string | null) => {
          logger.debug(`Global setCurrentMockUser called with ID: ${userId}. Reloading window.`);
          if (!userId || userId.trim() === "") {
            localStorage.removeItem(MOCK_USER_STORAGE_KEY);
          } else {
            localStorage.setItem(MOCK_USER_STORAGE_KEY, userId);
          }
          window.location.reload();
        };
    }
  }, []);

  const value = useMemo(() => ({
    currentUser,
    isAuthLoading,
  }), [currentUser, isAuthLoading]);

  return (
    <CurrentUserContext.Provider value={value}>
      {children}
    </CurrentUserContext.Provider>
  );
};


// The main Providers component wraps everything
export function Providers({ children, ...props }: ThemeProviderProps) {
  return (
    <NextThemesProvider {...props}>
      <CurrentUserProvider>
        {children}
        <Toaster />
      </CurrentUserProvider>
    </NextThemesProvider>
  );
}
