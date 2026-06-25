import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Handshake } from "lucide-react";
import DOMPurify from "isomorphic-dompurify";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/partnerfordele/$benefitId")({
  component: PartnerBenefitDetail,
});

type PartnerBenefit = {
  id: string;
  name: string;
  logo_path: string | null;
  hero_image_path: string | null;
  body: string | null;
  active: boolean;
};

function PartnerBenefitDetail() {
  const { benefitId } = Route.useParams();

  const { data: benefit, isLoading } = useQuery({
    queryKey: ["partner-benefit", benefitId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("partner_benefits")
        .select("id,name,logo_path,hero_image_path,body,active")
        .eq("id", benefitId)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as PartnerBenefit | null;
    },
  });

  const paths = [benefit?.logo_path, benefit?.hero_image_path].filter((p): p is string => !!p);
  const { data: imageMap } = useQuery({
    queryKey: ["partner-benefit-images", benefitId, paths.join(",")],
    enabled: paths.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from("partner-images")
        .createSignedUrls(paths, 60 * 60 * 24);
      if (error) throw error;
      const m: Record<string, string> = {};
      data?.forEach((d) => {
        if (d.path && d.signedUrl) m[d.path] = d.signedUrl;
      });
      return m;
    },
  });

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-2 py-6 sm:px-4">
      <Button variant="ghost" size="sm" asChild>
        <Link to="/partnerfordele">
          <ArrowLeft className="mr-1 h-4 w-4" /> Partnerfordele
        </Link>
      </Button>

      {isLoading && <p className="text-sm text-muted-foreground">Indlæser…</p>}
      {!isLoading && !benefit && (
        <p className="text-sm text-muted-foreground">Aftalen findes ikke.</p>
      )}

      {benefit && (
        <article className="space-y-6">
          {benefit.hero_image_path && imageMap?.[benefit.hero_image_path] && (
            <img
              src={imageMap[benefit.hero_image_path]}
              alt={benefit.name}
              className="w-full rounded-lg border border-border object-cover"
            />
          )}
          <div className="flex items-center gap-3">
            {benefit.logo_path && imageMap?.[benefit.logo_path] ? (
              <img src={imageMap[benefit.logo_path]} alt="" className="h-14 w-14 rounded object-contain bg-muted" />
            ) : (
              <Handshake className="h-10 w-10 text-primary" />
            )}
            <h1 className="text-2xl font-bold">{benefit.name}</h1>
          </div>
          {benefit.body && (
            <div
              className="prose-news text-sm"
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(benefit.body) }}
            />
          )}
        </article>
      )}
    </div>
  );
}
