
"use client";

import * as React from "react";
import { useRouter, usePathname } from "next/navigation";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LogIn, Network as NetworkIcon, Eye, EyeOff } from "lucide-react"; // Added NetworkIcon, Eye, EyeOff
import { useToast } from "@/hooks/use-toast";
import { useCurrentUser } from "@/hooks/use-current-user";
import { loginAction } from "@/lib/actions";

export default function LoginPage() {
  const [email, setEmail] = React.useState("admin@example.com"); // Pre-fill for convenience
  const [password, setPassword] = React.useState("admin"); // Pre-fill for convenience
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [showPassword, setShowPassword] = React.useState(false);
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

  const toggleShowPassword = () => setShowPassword(!showPassword);

  if (isAuthLoading) {
    return (
        <div className="flex min-h-screen items-center justify-center bg-background p-4">
            <p className="ml-4 text-lg text-muted-foreground">初始化认证...</p>
        </div>
    );
  }

  if (pageAuthStatus === 'authenticated' && pathname === '/login') {
     return (
        <div className="flex min-h-screen items-center justify-center bg-background p-4">
            <p className="ml-4 text-lg text-muted-foreground">正在重定向到仪表盘...</p>
        </div>
    );
  }

  if (pageAuthStatus === 'unauthenticated') {
    return (
      <div className="flex min-h-screen bg-gray-100">
        {/* Left Panel: Form */}
        <div className="w-full md:w-1/2 flex flex-col justify-center items-center bg-white p-8 sm:p-12 lg:px-24 xl:px-32">
          <div className="w-full max-w-md space-y-8">
            <div>
              <h2 className="mt-6 text-left text-4xl font-bold text-gray-900">Sign In</h2>
              <p className="mt-2 text-left text-sm text-gray-500">
                请输入邮箱和密码登录
              </p>
            </div>
            <form onSubmit={handleLogin} className="mt-8 space-y-6">
              <div className="rounded-md shadow-sm -space-y-px">
                <div className="space-y-2 mb-6">
                  <Label htmlFor="email" className="text-sm font-medium text-gray-700">Email <span className="text-red-500">*</span></Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="info@gmail.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    disabled={isSubmitting}
                    autoComplete="email"
                    className="appearance-none rounded-md relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-400 text-gray-900 focus:outline-none focus:ring-primary focus:border-primary focus:z-10 sm:text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password-input" className="text-sm font-medium text-gray-700">Password <span className="text-red-500">*</span></Label>
                  <div className="relative">
                    <Input
                      id="password-input"
                      type={showPassword ? "text" : "password"}
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      disabled={isSubmitting}
                      autoComplete="current-password"
                      className="appearance-none rounded-md relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-400 text-gray-900 focus:outline-none focus:ring-primary focus:border-primary focus:z-10 sm:text-sm pr-10"
                    />
                    <button
                      type="button"
                      onClick={toggleShowPassword}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-sm leading-5 text-gray-500 hover:text-gray-700"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                </div>
              </div>

              <div>
                <Button
                  type="submit"
                  className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-primary hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:opacity-70"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? "登录中..." : "Sign in"}
                </Button>
              </div>
            </form>
          </div>
        </div>

        {/* Right Panel: Branding and Image */}
        <div className="hidden md:flex md:w-1/2 bg-blue-900 flex-col justify-center items-center p-12 text-white relative overflow-hidden">
          {/* You can add a subtle grid pattern here later if needed with pseudo-elements or an SVG background */}
          <div className="text-center space-y-4 mb-8">
            <NetworkIcon className="h-16 w-16 mx-auto text-sky-400" />
            <h1 className="text-5xl font-bold">IPAM Lite</h1>
            <p className="text-xl font-light text-gray-300">ip address management</p>
          </div>
          <div className="w-full max-w-md lg:max-w-lg xl:max-w-xl">
            <Image
              src="/image/right.png"
              alt="Network Globe Abstract Art"
              width={600}
              height={600}
              className="object-contain"
              priority
              data-ai-hint="network globe abstract"
            />
          </div>
        </div>
      </div>
    );
  }

  // Fallback for states other than 'unauthenticated' if needed, though router.replace should handle most cases.
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <p className="ml-4 text-lg text-muted-foreground">加载中...</p>
    </div>
  );
}
