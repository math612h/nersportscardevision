import { useLocation, useRouter } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Tilbage-knap øverst på alle undersider.
 * Skjules på forsiden og login-siden.
 */
export function BackBar() {
  const location = useLocation();
  const router = useRouter();

  // Skjul på forsiden og login
  if (location.pathname === "/" || location.pathname.startsWith("/login")) {
    return null;
  }

  const handleBack = () => {
    // Brug browserens history hvis muligt; ellers gå til forsiden
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.history.back();
    } else {
      router.navigate({ to: "/" });
    }
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pt-3">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={handleBack}
        className="gap-1 -ml-2 text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Tilbage
      </Button>
    </div>
  );
}
