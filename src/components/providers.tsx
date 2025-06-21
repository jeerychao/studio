
"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ThemeProviderProps } from "next-themes/dist/types";
import { Toaster } from "@/components/ui/toaster";
import { CurrentUserContext, MOCK_USER_STORAGE_KEY, type CurrentUserContextValue } from "@/hooks/use-current-user";
import { fetchCurrentUserDetailsAction } from "@/lib/actions";
import { logger } from "@/lib/logger";

function CurrentUserProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, _setCurrentUser] = React.useState<CurrentUserContextValue | null>(null);
  const [isAuthLoading, setIsAuthLoading] = React.useState(true);

  // Initialize state from localStorage on initial mount
  React.useEffect(() => {
    const initializeUser = async () => {
      setIsAuthLoading(true);
      try {
        const storedUserId = localStorage.getItem(MOCK_USER_STORAGE_KEY);
        if (storedUserId) {
          logger.debug(`CurrentUserProvider: Found storedUserId: ${storedUserId}. Fetching details...`);
          const userDetails = await fetchCurrentUserDetailsAction(storedUserId);
          if (userDetails) {
            _setCurrentUser({ ...userDetails, permissions: userDetails.permissions || [] });
          } else {
            logger.warn(`CurrentUserProvider: User details not found for stored ID "${storedUserId}". Clearing invalid session.`, undefined, { storedUserId });
            localStorage.removeItem(MOCK_USER_STORAGE_KEY);
            _setCurrentUser(null);
          }
        } else {
           _setCurrentUser(null);
        }
      } catch (error) {
        logger.error("CurrentUserProvider: Error during user initialization.", error as Error);
        _setCurrentUser(null);
      } finally {
        setIsAuthLoading(false);
      }
    };
    initializeUser();
  }, []);

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
