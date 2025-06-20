
"use client";

import * as React from "react";
import { useRouter, usePathname } from "next/navigation";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LogIn, Eye, EyeOff, Network as NetworkIcon, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useCurrentUser } from "@/hooks/use-current-user";
import { loginAction } from "@/lib/actions";

export default function LoginPage() {
  const [email, setEmail] = React.useState("admin@example.com");
  const [password, setPassword] = React.useState("admin");
  const [showPassword, setShowPassword] = React.useState(false);
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

  if (isAuthLoading || pageAuthStatus === 'loading') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
        {/* <Image src="/images/one-logo.png" alt="IPAM Lite Logo" width={150} height={50} priority /> */}
        <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
        <p className="text-lg text-muted-foreground">初始化认证...</p>
      </div>
    );
  }

  if (pageAuthStatus === 'authenticated' && pathname === '/login') {
     return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
        {/* <Image src="/images/one-logo.png" alt="IPAM Lite Logo" width={150} height={50} priority /> */}
        <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
        <p className="text-lg text-muted-foreground">正在重定向到仪表盘...</p>
      </div>
    );
  }

  if (pageAuthStatus === 'unauthenticated') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
        <Card className="w-full max-w-sm">
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl flex items-center justify-center">
              <NetworkIcon className="mr-2 h-6 w-6 text-primary" />
              登录
            </CardTitle>
            <CardDescription className="text-center">
              请输入您的邮箱和密码以登录系统。
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <form onSubmit={handleLogin} className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="email">邮箱</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="m@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={isSubmitting}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="password">密码</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="输入您的密码"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={isSubmitting}
                    className="pr-10" // Make space for the icon
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 text-muted-foreground hover:bg-transparent hover:text-current"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? "隐藏密码" : "显示密码"}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    登录中...
                  </>
                ) : (
                  "登录"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
        <p className="text-lg text-muted-foreground">加载中...</p>
    </div>
  );
}
