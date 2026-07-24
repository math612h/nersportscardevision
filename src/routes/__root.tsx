import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useLocation,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { AuthProvider } from "@/hooks/use-auth";
import { AppHeader } from "@/components/AppHeader";
import { BackBar } from "@/components/BackBar";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { Toaster } from "@/components/ui/sonner";
import { SplashScreen } from "@/components/SplashScreen";
import "@/i18n";
import { useApplyGuestLanguage } from "@/components/GuestLanguageSwitcher";
import { initAnalytics, trackPageview, setAnalyticsUser } from "@/lib/analytics-tracker";
import { useAuth } from "@/hooks/use-auth";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => {
    const siteTitle = "LMU Danmark — Sim-racing ligaer i Le Mans Ultimate";
    const siteDesc =
      "Sim-racing liga-hub til Le Mans Ultimate: tilmeld dig ligaer og off-season events, læs regelsæt, følg stillinger og se hurtigste omgangstider på leaderboardet.";
    const ogImage =
      "https://lmudanmark.dk/__l5e/assets-v1/c7bbb42d-034b-400c-b4f2-f8f22f307569/lmu-logo.png";
    return {
      meta: [
        { charSet: "utf-8" },
        { name: "viewport", content: "width=device-width, initial-scale=1" },
        { title: siteTitle },
        { name: "description", content: siteDesc },
        { property: "og:site_name", content: "LMU Danmark" },
        { property: "og:title", content: siteTitle },
        { property: "og:description", content: siteDesc },
        { property: "og:type", content: "website" },
        { property: "og:image", content: ogImage },
        { property: "og:image:alt", content: "LMU Danmark logo" },
        { name: "twitter:title", content: siteTitle },
        { name: "twitter:description", content: siteDesc },
        { name: "twitter:image", content: ogImage },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "theme-color", content: "#0a0a0a" },
        { name: "apple-mobile-web-app-capable", content: "yes" },
        { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
        { name: "apple-mobile-web-app-title", content: "LMU Danmark" },
      ],
      links: [
        { rel: "stylesheet", href: appCss },
        { rel: "manifest", href: "/manifest.webmanifest" },
        { rel: "apple-touch-icon", href: "/icons/apple-touch-icon.png" },
        { rel: "icon", type: "image/png", sizes: "192x192", href: "/icons/icon-192.png" },
        { rel: "icon", type: "image/png", sizes: "512x512", href: "/icons/icon-512.png" },
      ],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Organization",
            name: "LMU Danmark",
            url: "https://danishenduranceseries.dk",
            description:
              "Dansk sim-racing community med ligaer i Le Mans Ultimate.",
          }),
        },
      ],
    };
  },
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="da">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Shell />
        <Toaster />
        <SplashScreen />
      </AuthProvider>
    </QueryClientProvider>
  );
}

function Shell() {
  useApplyGuestLanguage();
  const location = useLocation();
  const isLogin = location.pathname.startsWith("/login");
  if (isLogin) return <Outlet />;
  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <BackBar />
      <main className="mx-auto max-w-6xl px-4 py-6 pb-24 sm:pb-6">
        <Outlet />
      </main>
      <MobileBottomNav />
    </div>
  );
}
