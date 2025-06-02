
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
import { mockUsers, ADMIN_ROLE_ID } from "@/lib/data"; // Using mockUsers for authentication

export default function LoginPage() {
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(false);
  const router = useRouter();
  const { toast } = useToast();
  const currentUser = useCurrentUser(); // To check if already logged in

  React.useEffect(() => {
    // If user is already authenticated (not the guest user), redirect to dashboard
    if (currentUser && currentUser.id && !(currentUser.id === 'guest-fallback-id' && currentUser.username === 'Guest')) {
      router.replace("/dashboard");
    }
  }, [currentUser, router]);


  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsLoading(true);

    const foundUser = mockUsers.find(user => user.email === email);

    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 1000));

    if (foundUser && password) { // For mock, just check if password is not empty
      if (typeof window !== "undefined" && (window as any).setCurrentMockUser) {
        (window as any).setCurrentMockUser(foundUser.id); // This function from useCurrentUser reloads the page
        toast({ title: "Login Successful", description: `Welcome back, ${foundUser.username}!` });
        // setCurrentMockUser will handle localStorage and reload, which triggers redirection via DashboardLayout
      } else {
        toast({ title: "Login Error", description: "Unable to set user. Developer function missing.", variant: "destructive" });
      }
    } else {
      toast({ title: "Login Failed", description: "Invalid email or password. Please try again.", variant: "destructive" });
    }
    setIsLoading(false);
  };
  
  // If already authenticated and redirecting, show minimal content or loader
  if (currentUser && currentUser.id && !(currentUser.id === 'guest-fallback-id' && currentUser.username === 'Guest')) {
    return (
        <div className="flex items-center justify-center h-screen">
            <p>Redirecting to dashboard...</p>
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
                disabled={isLoading}
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
                disabled={isLoading}
              />
            </div>
          </CardContent>
          <CardFooter className="flex flex-col">
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? "Signing In..." : <><LogIn className="mr-2 h-4 w-4" /> Sign In</>}
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
