
"use client";

import * as React from "react";
import { useRouter, usePathname } from "next/navigation";
import Image from "next/image"; // Import the Image component
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
import { LogIn } from "lucide-react"; 
import { useToast } from "@/hooks/use-toast";
import { useCurrentUser } from "@/hooks/use-current-user";
import { loginAction } from "@/lib/actions";

export default function LoginPage() {
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const { toast } = useToast();
  const { currentUser, isAuthLoading } = useCurrentUser();
  const [pageAuthStatus, setPageAuthStatus] = React.useState<
    "loading" | "authenticated" | "unauthenticated"
  >("loading");

  React.useEffect(() => {
    if (isAuthLoading) {
      setPageAuthStatus("loading");
      return;
    }

    if (
      currentUser &&
      currentUser.id &&
      !(currentUser.id === "guest-fallback-id" && currentUser.username === "Guest")
    ) {
      setPageAuthStatus("authenticated");
      if (pathname === "/login") {
        router.replace("/dashboard");
      }
    } else {
      setPageAuthStatus("unauthenticated");
    }
  }, [currentUser, isAuthLoading, router, pathname]);

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();    
    setIsSubmitting(true);

    try {
      const result = await loginAction({ email, password });

      if (result.success && result.user) {
        if (typeof window !== "undefined" && (window as any).setCurrentMockUser) {
          (window as any).setCurrentMockUser(result.user.id); 
          toast({ title: "登录成功", description: `欢迎回来, ${result.user.username}!` });
          router.push("/dashboard");
        } else {
          toast({ title: "登录错误", description: "客户端错误: 无法设置用户会话。", variant: "destructive" });
        }
      } else {
        toast({ title: "登录失败", description: result.message || "邮箱或密码无效。", variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "登录错误", description: (error as Error).message || "发生意外错误。", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isAuthLoading) {
    return (
        <div className="flex min-h-screen items-center justify-center bg-background p-4">
            <Image src="/images/one-logo.png" alt="IPAM Lite Logo" width={80} height={80} priority data-ai-hint="company logo" />
            <p className="ml-4 text-lg">初始化认证...</p>
        </div>
    );
  }

  if (pageAuthStatus === 'authenticated' && pathname === '/login') {
     return (
        <div className="flex min-h-screen items-center justify-center bg-background p-4">
            <Image src="/images/one-logo.png" alt="IPAM Lite Logo" width={80} height={80} priority data-ai-hint="company logo" />
            <p className="ml-4 text-lg">正在重定向到仪表盘...</p>
        </div>
    );
  }

  if (pageAuthStatus === 'unauthenticated') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-sm shadow-xl">
          <CardHeader className="space-y-1 text-center">
            <div className="flex justify-center mb-4">
              <Image src="/images/one-logo.png" alt="IPAM Lite Logo" width={80} height={80} priority data-ai-hint="company logo" />
            </div>
            <CardTitle className="text-2xl">欢迎使用 IPAM Lite</CardTitle>
            <CardDescription>
              输入您的凭据以访问 IP 地址管理系统。 <br/>
              (例如: admin@example.com / admin)
            </CardDescription>
          </CardHeader>
          <form onSubmit={handleLogin}>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="email">邮箱</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="user@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={isSubmitting}
                  autoComplete="email"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">密码</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="********"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={isSubmitting}
                  autoComplete="current-password"
                />
              </div>
            </CardContent>
            <CardFooter className="flex flex-col">
              <Button
                type="submit"
                className="w-full"
                disabled={isSubmitting}
              >
                {isSubmitting ? "登录中..." : <><LogIn className="mr-2 h-4 w-4" /> 登录</>}
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Image src="/images/one-logo.png" alt="IPAM Lite Logo" width={80} height={80} priority data-ai-hint="company logo" />
        <p className="ml-4 text-lg">加载中...</p>
    </div>
  );
}

    