
"use client";

import * as React from "react";
import { useRouter, usePathname } from "next/navigation";
import Image from "next/image";
import { Button } from "@/components/ui/button";
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
        <NetworkIcon className="h-20 w-20 text-primary mb-6 animate-pulse" data-ai-hint="logo network icon" />
        <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
        <p className="text-lg text-muted-foreground">初始化认证...</p>
      </div>
    );
  }

  if (pageAuthStatus === 'authenticated' && pathname === '/login') {
     return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
        <NetworkIcon className="h-20 w-20 text-primary mb-6 animate-pulse" data-ai-hint="logo network icon" />
        <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
        <p className="text-lg text-muted-foreground">正在重定向到仪表盘...</p>
      </div>
    );
  }

  if (pageAuthStatus === 'unauthenticated') {
    return (
      <div className="min-h-screen w-full lg:grid lg:grid-cols-2">
        <div className="flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 bg-card">
          <div className="mx-auto w-full max-w-md space-y-8">
            <div>
              <h2 className="mt-6 text-center text-4xl font-bold tracking-tight text-foreground">
                Sign In
              </h2>
              <p className="mt-2 text-center text-sm text-muted-foreground">
                请输入邮箱和密码登录
              </p>
            </div>
            <form onSubmit={handleLogin} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="email">Email<span className="text-destructive">*</span></Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="info@gmail.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={isSubmitting}
                  autoComplete="email"
                  className="h-12 text-base"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password<span className="text-destructive">*</span></Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={isSubmitting}
                    autoComplete="current-password"
                    className="h-12 text-base pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2 text-muted-foreground hover:bg-transparent hover:text-current"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </Button>
                </div>
              </div>
              <Button
                type="submit"
                className="w-full h-12 text-base font-semibold"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    登录中...
                  </>
                ) : (
                  "Sign in"
                )}
              </Button>
            </form>
          </div>
        </div>
        <div className="hidden bg-[#191a52] lg:flex lg:flex-col lg:items-center lg:justify-center p-12 text-white relative overflow-hidden">
          {/* Subtle background pattern - kept for visual interest, adjust opacity or remove if not desired */}
          <div
            className="absolute inset-0 opacity-[0.02]" // Reduced opacity further
            style={{
              backgroundImage:
                "linear-gradient(45deg, hsl(0 0% 100%) 12.50%, transparent 12.50%, transparent 37.50%, hsl(0 0% 100%) 37.50%, hsl(0 0% 100%) 62.50%, transparent 62.50%, transparent 87.50%, hsl(0 0% 100%) 87.50%), linear-gradient(-45deg, hsl(0 0% 100%) 12.50%, transparent 12.50%, transparent 37.50%, hsl(0 0% 100%) 37.50%, hsl(0 0% 100%) 62.50%, transparent 62.50%, transparent 87.50%, hsl(0 0% 100%) 87.50%)",
              backgroundSize: "40px 40px",
            }}
          />
          <div className="relative z-10 text-center flex flex-col items-center justify-center h-full">
            <NetworkIcon className="h-12 w-12 mx-auto mb-4 text-white opacity-90" data-ai-hint="network icon" />
            <h1 className="text-4xl font-bold tracking-tight">IPAM Lite</h1>
            <p className="mt-2 text-lg opacity-80">ip address management</p>
            <div className="mt-8 flex-grow flex items-center justify-center w-full max-w-md">
              <Image
                src="/image/right.png"
                alt="IP Address Management Globe"
                width={400} // Adjusted size for potentially better fit
                height={400}
                priority
                className="object-contain" // Ensures the image scales within its container
                data-ai-hint="globe network"
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <NetworkIcon className="h-20 w-20 text-primary mb-6 animate-pulse" data-ai-hint="logo network icon" />
      <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
      <p className="text-lg text-muted-foreground">加载中...</p>
    </div>
  );
}
