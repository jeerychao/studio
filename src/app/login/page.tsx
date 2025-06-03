
"use client";

import * as React from "react";
import { useRouter, usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Network, LogIn } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useCurrentUser } from "@/hooks/use-current-user";
// Import a new server action for login
import { loginAction } from "@/lib/actions";


export default function LoginPage() {
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const { toast } = useToast();
  const { currentUser, isAuthLoading } = useCurrentUser();
  const [pageAuthStatus, setPageAuthStatus] = React.useState<'loading' | 'authenticated' | 'unauthenticated'>('loading');

  React.useEffect(() => {
    if (isAuthLoading) {
      setPageAuthStatus('loading');
      return;
    }

    if (currentUser && currentUser.id && !(currentUser.id === 'guest-fallback-id' && currentUser.username === 'Guest')) {
      setPageAuthStatus('authenticated');
      if (pathname === '/login') {
        router.replace("/dashboard");
      }
    } else {
      setPageAuthStatus('unauthenticated');
    }
  }, [currentUser, isAuthLoading, router, pathname]);

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);

    try {
      const result = await loginAction({ email, password });

      if (result.success && result.user) {
        if (typeof window !== "undefined" && (window as any).setCurrentMockUser) {
          (window as any).setCurrentMockUser(result.user.id); // Simulate client-side session update
          toast({ title: "Login Successful", description: `Welcome back, ${result.user.username}!` });
          router.push("/dashboard");
        } else {
          toast({ title: "Login Error", description: "Client-side error: Unable to set user session.", variant: "destructive" });
        }
      } else {
        toast({ title: "Login Failed", description: result.message || "Invalid email or password.", variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Login Error", description: (error as Error).message || "An unexpected error occurred.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isAuthLoading) {
    return (
        <div className="flex min-h-screen items-center justify-center bg-background p-4">
            <Network className="h-12 w-12 animate-spin text-primary" />
            <p className="ml-4 text-lg">Initializing authentication...</p>
        </div>
    );
  }

  if (pageAuthStatus === 'authenticated' && pathname === '/login') {
     return (
        <div className="flex min-h-screen items-center justify-center bg-background p-4">
            <Network className="h-12 w-12 animate-spin text-primary" />
            <p className="ml-4 text-lg">Redirecting to dashboard...</p>
        </div>
    );
  }

  if (pageAuthStatus === 'unauthenticated') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-sm shadow-xl">
          <CardHeader className="space-y-1 text-center">
            <div className="flex justify-center mb-4">
              <Network className="h-12 w-12 text-primary" />
            </div>
            <CardTitle className="text-2xl">Welcome to IPAM Lite</CardTitle>
            <CardDescription>
              Enter your credentials to access the IP Address Management system. <br/>
              (e.g., admin/admin)
            </CardDescription>
          </CardHeader>
          <form onSubmit={handleLogin}>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="user@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={isSubmitting}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="********"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={isSubmitting}
                />
              </div>
            </CardContent>
            <CardFooter className="flex flex-col">
              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? "Signing In..." : <><LogIn className="mr-2 h-4 w-4" /> Sign In</>}
              </Button>
              {/* Removed the "Other mock users" hint as it's no longer relevant */}
            </CardFooter>
          </form>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Network className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-4 text-lg">Loading...</p>
    </div>
  );
}
