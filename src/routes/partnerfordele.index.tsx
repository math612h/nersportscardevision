import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Handshake } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/partnerfordele/")({
  component: PartnerfordelePage,
});

type PartnerBenefit = {
  id: string;
  name: string;
  logo_path: string | null;
};

function PartnerfordelePage() {
  const { t } = useTranslation();

  const { data: benefits, isLoading } = useQuery({
    queryKey: ["partner-benefits"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("partner_benefits")
        .select("id,name,logo_path")
        .eq("active", true)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as PartnerBenefit[];
    },
  });

  const logoPaths = (benefits ?? []).map((b) => b.logo_path).filter((p): p is string => !!p);
  const { data: imageMap } = useQuery({
    queryKey: ["partner-benefit-logos", logoPaths.sort().join(",")],
    enabled: logoPaths.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from("partner-images")
        .createSignedUrls(logoPaths, 60 * 60 * 24);
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(benefits ?? []).map((b) => (
          <Link key={b.id} to="/partnerfordele/$benefitId" params={{ benefitId: b.id }} className="group">
            <Card className="h-full transition hover:border-primary hover:shadow-md">
              <CardContent className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
                <div className="flex h-32 w-full items-center justify-center rounded-md bg-muted/40">
                  {b.logo_path && imageMap?.[b.logo_path] ? (
                    <img src={imageMap[b.logo_path]} alt={b.name} className="max-h-28 max-w-[80%] object-contain" />
                  ) : (
                    <Handshake className="h-12 w-12 text-muted-foreground" />
                  )}
                </div>
                <h2 className="text-base font-semibold group-hover:text-primary">{b.name}</h2>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
