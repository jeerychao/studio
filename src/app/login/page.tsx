
"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useCurrentUser } from "@/hooks/use-current-user";
import { loginAction } from "@/lib/actions";

export default function LoginPage() {
  const [email, setEmail] = React.useState("admin@example.com");
  const [password, setPassword] = React.useState("admin");
  const [showPassword, setShowPassword] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const router = useRouter();
  const { toast } = useToast();
  const { currentUser, isAuthLoading, setCurrentUser } = useCurrentUser();

  React.useEffect(() => {
    // Only check for redirection after the initial loading is complete.
    if (!isAuthLoading && currentUser) {
      router.replace("/dashboard");
    }
  }, [currentUser, isAuthLoading, router]);

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);

    try {
      const result = await loginAction({ email, password });

      if (result.success && result.user) {
        toast({ title: "登录成功", description: `欢迎回来, ${result.user.username}!` });
        // Set the user in the provider, which will also update localStorage
        setCurrentUser(result.user);
        // Soft navigation to the dashboard.
        // The AuthGuard will now see the updated user state.
        router.replace('/dashboard');
      } else {
        toast({ title: "登录失败", description: result.message || "邮箱或密码无效。", variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "登录错误", description: (error as Error).message || "发生意外错误。", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };
  
  // Show a loading screen while checking auth status or if user is authenticated and redirecting
  if (isAuthLoading || currentUser) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
        <p className="text-lg text-muted-foreground">
          {isAuthLoading ? "正在验证您的身份..." : "已登录，正在重定向到仪表盘..."}
        </p>
      </div>
    );
  }

  // If not loading and not authenticated, show the login form
  return (
    <div className="flex min-h-screen bg-background">
      {/* Left Panel: Login Form */}
      <div className="flex flex-1 flex-col p-6 md:p-10">
        <div className="flex flex-grow flex-col items-center justify-center">
          <div className="w-full max-w-sm space-y-6">
            <div>
              <h1 className="text-3xl font-bold">登录</h1>
              <p className="text-muted-foreground">请输入邮箱和密码登录 (例如: youmail@example.com)</p>
            </div>
            <form onSubmit={handleLogin} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="email">邮箱</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="m@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={isSubmitting}
                  className="h-10" 
                />
              </div>
              <div className="space-y-2">
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
                    className="pr-10 h-10" 
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
              <Button type="submit" className="w-full h-10" disabled={isSubmitting}>
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
          </div>
        </div>
        {/* Copyright and Contact Info */}
        <div className="mt-auto pt-6 text-center">
          <hr className="my-2 border-border" />
          <p className="text-xs text-muted-foreground">
            © 2025 IPAM Lite. 版权所有.联系方式: leejie2017@gmail.com
          </p>
        </div>
      </div>

      {/* Right Panel: Image */}
      <div className="hidden md:flex md:flex-1 flex-col items-center justify-center bg-[#191a52] p-10">
        <Image
          src="/images/middl.png"
          alt="Login background image"
          width={881}
          height={559}
          className="object-contain max-w-full max-h-full"
          priority
          data-ai-hint="globe network"
        />
      </div>
    </div>
  );
}
