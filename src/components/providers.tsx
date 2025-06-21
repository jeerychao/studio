
"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ThemeProviderProps } from "next-themes/dist/types";
import { Toaster } from "@/components/ui/toaster";
import { CurrentUserContext, MOCK_USER_STORAGE_KEY, type CurrentUserContextValue } from "@/hooks/use-current-user";
import { fetchCurrentUserDetailsAction } from "@/lib/actions";
import { logger } from "@/lib/logger";

function CurrentUserProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = React.useState<CurrentUserContextValue | null>(null);
  const [isAuthLoading, setIsAuthLoading] = React.useState(true);
  const isInitializedRef = React.useRef(false);

  React.useEffect(() => {
    if (isInitializedRef.current) return;
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
            userToSet = { ...userDetails, permissions: userDetails.permissions || [] };
          } else {
            // CRITICAL FIX: Do not remove the item from local storage.
            // This prevents the infinite loop. If the user's data is corrupt or
            // they were deleted, they will be treated as logged out for this session
            // and redirected to /login by AuthGuard. This is the correct behavior.
            logger.error(
              `CurrentUserProvider: fetchCurrentUserDetailsAction returned null for stored ID "${storedUserId}". This indicates a data integrity issue (e.g., user deleted but session remains) or a server error. The user will be treated as logged out.`,
              undefined,
              { storedUserId }
            );
          }
        } else {
          logger.debug("CurrentUserProvider: No storedUserId found. User is not authenticated.");
        }
      } catch (error) {
        logger.error("CurrentUserProvider: Error during user initialization.", error as Error);
      } finally {
        setCurrentUser(userToSet);
        setIsAuthLoading(false);
        logger.debug("CurrentUserProvider: Initialization complete.", { userSet: userToSet ? userToSet.username : 'null' });
      }
    };

    initializeUser();

    if (typeof window !== "undefined" && !(window as any).setCurrentMockUser) {
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

  const value = React.useMemo(() => ({
    currentUser,
    isAuthLoading,
  }), [currentUser, isAuthLoading]);

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
