
"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ThemeProviderProps } from "next-themes/dist/types";
import { Toaster } from "@/components/ui/toaster";
import { CurrentUserContext, MOCK_USER_STORAGE_KEY, type CurrentUserContextValue } from "@/hooks/use-current-user";
import { fetchCurrentUserDetailsAction } from "@/lib/actions";
import { logger } from "@/lib/logger";

const AUTH_TIMEOUT = 8000; // 8 seconds

function CurrentUserProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, _setCurrentUser] = React.useState<CurrentUserContextValue | null>(null);
  const [isAuthLoading, setIsAuthLoading] = React.useState(true);

  // Initialize state from localStorage on initial mount
  React.useEffect(() => {
    let isMounted = true;
    const timeoutId = setTimeout(() => {
      if (isMounted && isAuthLoading) {
        logger.error(`Authentication timed out after ${AUTH_TIMEOUT / 1000} seconds. This might indicate a database connection issue.`, undefined, { context: 'CurrentUserProvider' });
        if(isMounted) {
          _setCurrentUser(null);
          setIsAuthLoading(false);
        }
      }
    }, AUTH_TIMEOUT);

    const initializeUser = async () => {
      if (!isMounted) return;
      try {
        const storedUserId = localStorage.getItem(MOCK_USER_STORAGE_KEY);
        if (storedUserId) {
          logger.debug(`CurrentUserProvider: Found storedUserId: ${storedUserId}. Fetching details...`);
          const userDetails = await fetchCurrentUserDetailsAction(storedUserId);
          if (isMounted) {
            if (userDetails) {
              _setCurrentUser({ ...userDetails, permissions: userDetails.permissions || [] });
            } else {
              logger.warn(`CurrentUserProvider: User details not found for stored ID "${storedUserId}". Clearing invalid session.`, undefined, { storedUserId });
              localStorage.removeItem(MOCK_USER_STORAGE_KEY);
              _setCurrentUser(null);
            }
          }
        } else {
           if (isMounted) _setCurrentUser(null);
        }
      } catch (error) {
        logger.error("CurrentUserProvider: Error during user initialization.", error as Error);
        if (isMounted) _setCurrentUser(null);
      } finally {
        if (isMounted) {
          setIsAuthLoading(false);
          clearTimeout(timeoutId);
        }
      }
    };
    
    initializeUser();

    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
    };
  }, []); // Run only once on mount

  // Create a stable setCurrentUser function that updates both state and localStorage
  const setCurrentUser = React.useCallback((user: CurrentUserContextValue | null) => {
    _setCurrentUser(user);
    if (user) {
      localStorage.setItem(MOCK_USER_STORAGE_KEY, user.id);
    } else {
      localStorage.removeItem(MOCK_USER_STORAGE_KEY);
    }
  }, []);

  const value = React.useMemo(() => ({
    currentUser,
    isAuthLoading,
    setCurrentUser,
  }), [currentUser, isAuthLoading, setCurrentUser]);

  return (
    <CurrentUserContext.Provider value={value}>
      {children}
    </CurrentUserContext.Provider>
  );
}


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
