
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
import { useCurrentUser } from "@/hooks/use-current-user";
import { mockUsers } from "@/lib/data";

export default function LoginPage() {
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const router = useRouter();
  const { toast } = useToast();
  const { currentUser, isAuthLoading } = useCurrentUser();
  const [pageAuthStatus, setPageAuthStatus] = React.useState<'loading' | 'authenticated' | 'unauthenticated'>(isAuthLoading ? 'loading' : 'unauthenticated');

  React.useEffect(() => {
    if (isAuthLoading) {
      setPageAuthStatus('loading');
      return;
    }

    if (currentUser && currentUser.id) { 
      if (!(currentUser.id === 'guest-fallback-id' && currentUser.username === 'Guest')) {
        setPageAuthStatus('authenticated');
      } else {
        setPageAuthStatus('unauthenticated');
      }
    } else {
       setPageAuthStatus('unauthenticated');
    }
  }, [currentUser, isAuthLoading]);

  React.useEffect(() => {
    if (pageAuthStatus === 'authenticated') {
      router.replace("/dashboard");
    }
  }, [pageAuthStatus, router]);

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);

    const foundUser = mockUsers.find(user => user.email === email);

    await new Promise(resolve => setTimeout(resolve, 500)); 

    let loginSuccess = false;
    if (foundUser) {
      if (email === "admin@example.com") {
        if (password === "password") { // Specific password for admin
          loginSuccess = true;
        }
      } else if (password) { // For other mock users, any non-empty password
        loginSuccess = true;
      }
    }

    if (loginSuccess && foundUser) {
      if (typeof window !== "undefined" && (window as any).setCurrentMockUser) {
        (window as any).setCurrentMockUser(foundUser.id); 
        toast({ title: "Login Successful", description: `Welcome back, ${foundUser.username}!` });
        router.push("/dashboard"); // Navigate to dashboard after setting user
      } else {
        toast({ title: "Login Error", description: "Unable to set user. Developer function missing.", variant: "destructive" });
      }
    } else {
      toast({ title: "Login Failed", description: "Invalid email or password. Please try again.", variant: "destructive" });
    }
    setIsSubmitting(false);
  };
  
  if (pageAuthStatus === 'loading' || (pageAuthStatus === 'authenticated' && !isAuthLoading)) {
    return (
        <div className="flex min-h-screen items-center justify-center bg-background p-4">
            <Network className="h-12 w-12 animate-spin text-primary" /> 
            <p className="ml-4 text-lg">
              {pageAuthStatus === 'authenticated' ? "Redirecting to dashboard..." : "Loading login page..."}
            </p>
        </div>
    );
  }

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
            Admin: admin@example.com / password
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
              (Other mock users: any non-empty password)
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
