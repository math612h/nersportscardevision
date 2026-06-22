import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Globe } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import {
  SUPPORTED_LANGUAGES,
  GUEST_LANG_STORAGE_KEY,
  type LanguageCode,
} from "@/i18n";

/** Reads the persisted guest language from localStorage and applies it once. */
export function useApplyGuestLanguage() {
  const { isGuest } = useAuth();
  const { i18n } = useTranslation();
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!isGuest) {
      if (i18n.language !== "da") void i18n.changeLanguage("da");
      return;
    }
    const stored = window.localStorage.getItem(GUEST_LANG_STORAGE_KEY) as LanguageCode | null;
    const target = stored && SUPPORTED_LANGUAGES.some((l) => l.code === stored) ? stored : "en";
    if (i18n.language !== target) void i18n.changeLanguage(target);
  }, [isGuest, i18n]);
}

/** Language switcher visible only to guests, shown in the header. */
export function GuestLanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const { isGuest } = useAuth();
  const { i18n } = useTranslation();
  if (!isGuest) return null;
  const current = SUPPORTED_LANGUAGES.find((l) => l.code === i18n.language) ?? SUPPORTED_LANGUAGES[1];

  const setLang = (code: LanguageCode) => {
    void i18n.changeLanguage(code);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(GUEST_LANG_STORAGE_KEY, code);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1" aria-label="Language">
          <Globe className="h-4 w-4" />
          <span className="hidden text-xs sm:inline">{current.flag} {compact ? current.code.toUpperCase() : current.label}</span>
          <span className="text-xs sm:hidden">{current.flag}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        {SUPPORTED_LANGUAGES.map((l) => (
          <DropdownMenuItem key={l.code} onClick={() => setLang(l.code)} className={l.code === current.code ? "font-semibold" : ""}>
            <span className="mr-2">{l.flag}</span> {l.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Inline language picker used in the login dialog (no auth context needed). */
export function LoginLanguageSelector({
  value,
  onChange,
}: {
  value: LanguageCode;
  onChange: (code: LanguageCode) => void;
}) {
  const current = SUPPORTED_LANGUAGES.find((l) => l.code === value) ?? SUPPORTED_LANGUAGES[1];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="w-full justify-start gap-2">
          <Globe className="h-4 w-4" />
          {current.flag} {current.label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-[--radix-dropdown-menu-trigger-width]">
        {SUPPORTED_LANGUAGES.map((l) => (
          <DropdownMenuItem key={l.code} onClick={() => onChange(l.code)} className={l.code === value ? "font-semibold" : ""}>
            <span className="mr-2">{l.flag}</span> {l.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
