import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, Handshake } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/partnerfordele/")({
  component: PartnerfordelePage,
});

type PartnerBenefit = {
  id: string;
  name: string;
  logo_path: string | null;
  hero_image_path: string | null;
};

function PartnerfordelePage() {
  const { t } = useTranslation();

  const { data: benefits, isLoading } = useQuery({
    queryKey: ["partner-benefits"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("partner_benefits")
        .select("id,name,logo_path,hero_image_path")
        .eq("active", true)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as PartnerBenefit[];
    },
  });

  const allPaths = (benefits ?? [])
    .flatMap((b) => [b.logo_path, b.hero_image_path])
    .filter((p): p is string => !!p);
  const { data: imageMap } = useQuery({
    queryKey: ["partner-benefit-images-list", allPaths.sort().join(",")],
    enabled: allPaths.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from("partner-images")
        .createSignedUrls(allPaths, 60 * 60 * 24);
      if (error) throw error;
      const m: Record<string, string> = {};
      data?.forEach((d) => {
        if (d.path && d.signedUrl) m[d.path] = d.signedUrl;
      });
      return m;
    },
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-2 py-6 sm:px-4">
      <div className="flex items-center gap-2">
        <Handshake className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">{t("partnerBenefits.title", "Partnerfordele")}</h1>
      </div>
      <p className="text-sm text-muted-foreground">
        {t("partnerBenefits.intro", "Klik på en partner for at se aftalen og hvordan du gør brug af den.")}
      </p>

      {isLoading && <p className="text-sm text-muted-foreground">Indlæser…</p>}
      {!isLoading && (benefits ?? []).length === 0 && (
        <p className="text-sm text-muted-foreground">
          {t("partnerBenefits.empty", "Ingen partneraftaler endnu.")}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {(benefits ?? []).map((b) => {
          const heroUrl = b.hero_image_path ? imageMap?.[b.hero_image_path] : null;
          const logoUrl = b.logo_path ? imageMap?.[b.logo_path] : null;
          const coverUrl = heroUrl ?? logoUrl;
          return (
            <Link key={b.id} to="/partnerfordele/$benefitId" params={{ benefitId: b.id }} className="group block">
              <Card className="flex h-full flex-col overflow-hidden border-border transition hover:border-primary hover:shadow-[0_8px_30px_-12px_hsl(var(--primary)/0.35)]">
                <div className="relative aspect-[16/9] w-full overflow-hidden bg-muted">
                  {coverUrl ? (
                    <img
                      src={coverUrl}
                      alt={b.name}
                      className={`h-full w-full transition duration-500 group-hover:scale-105 ${heroUrl ? "object-cover" : "object-contain p-6"}`}
                      loading="lazy"
                    />
                  ) : (
                    <div className="h-full w-full bg-gradient-to-br from-primary/25 via-primary/10 to-transparent" />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-card/90 via-card/20 to-transparent" />
                  {logoUrl && heroUrl && (
                    <div className="absolute bottom-3 left-3 flex h-12 w-12 items-center justify-center rounded-lg border border-border/60 bg-background/90 p-1 shadow-md backdrop-blur">
                      <img src={logoUrl} alt="" className="max-h-full max-w-full object-contain" />
                    </div>
                  )}
                  <div className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-background/70 text-foreground backdrop-blur transition group-hover:bg-primary group-hover:text-primary-foreground">
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </div>
                </div>
                <CardHeader className="pb-4">
                  <CardTitle className="text-base">{b.name}</CardTitle>
                  <CardDescription>
                    {t("partnerBenefits.cardCta", "Se aftalen")}
                  </CardDescription>
                </CardHeader>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
