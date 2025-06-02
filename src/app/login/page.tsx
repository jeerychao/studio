
"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
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
import { useCurrentUser, MOCK_USER_STORAGE_KEY } from "@/hooks/use-current-user";
import { mockUsers } from "@/lib/data";

export default function LoginPage() {
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [isSubmitting, setIsSubmitting] = React.useState(false); // Renamed from isLoading for clarity
  const router = useRouter();
  const { toast } = useToast();
  const currentUser = useCurrentUser();
  const [pageAuthStatus, setPageAuthStatus] = React.useState<'loading' | 'authenticated' | 'unauthenticated'>('loading');

  React.useEffect(() => {
    if (currentUser && currentUser.id) { // currentUser is resolved
      if (!(currentUser.id === 'guest-fallback-id' && currentUser.username === 'Guest')) {
        // User is authenticated (not guest)
        setPageAuthStatus('authenticated');
        router.replace("/dashboard");
      } else {
        // User is guest, ready to show login form
        setPageAuthStatus('unauthenticated');
      }
    }
    // If currentUser or currentUser.id is not yet available, pageAuthStatus remains 'loading'
  }, [currentUser, router]);

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);

    const foundUser = mockUsers.find(user => user.email === email);

    await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate API call

    if (foundUser && password) { 
      if (typeof window !== "undefined" && (window as any).setCurrentMockUser) {
        (window as any).setCurrentMockUser(foundUser.id); 
        toast({ title: "Login Successful", description: `Welcome back, ${foundUser.username}!` });
        // setCurrentMockUser reloads, DashboardLayout will handle the authenticated state
      } else {
        toast({ title: "Login Error", description: "Unable to set user. Developer function missing.", variant: "destructive" });
      }
    } else {
      toast({ title: "Login Failed", description: "Invalid email or password. Please try again.", variant: "destructive" });
    }
    setIsSubmitting(false);
  };
  
  if (pageAuthStatus === 'loading') {
    return (
        <div className="flex min-h-screen items-center justify-center bg-background p-4">
            <Network className="h-12 w-12 animate-spin text-primary" /> 
            <p className="ml-4 text-lg">Loading login page...</p>
        </div>
    );
  }

  if (pageAuthStatus === 'authenticated') {
    // This state means useEffect is about to redirect. Show a message.
     return (
        <div className="flex min-h-screen items-center justify-center bg-background p-4">
            <p>Redirecting to dashboard...</p>
        </div>
    );
  }

  // Only render form if pageAuthStatus is 'unauthenticated'
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
            (Use: admin@example.com / any password)
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
            <p className="mt-4 text-xs text-center text-muted-foreground">
              Don't have an account? This is a demo system. <br/>
              Default admin: admin@example.com (any password)
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
