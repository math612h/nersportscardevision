import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { ShieldAlert, Trash2, Check, Loader2 } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";

export function AddressConsentBanner() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: ["address-consent-state", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("profiles_private")
        .select("address, postal_code, city, address_consent_at")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data as {
        address: string | null;
        postal_code: string | null;
        city: string | null;
        address_consent_at: string | null;
      } | null;
    },
  });

  const giveConsent = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any)
        .from("profiles_private")
        .update({ address_consent_at: new Date().toISOString() })
        .eq("user_id", user!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Samtykke registreret. Tak!");
      qc.invalidateQueries({ queryKey: ["address-consent-state", user?.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const clearAddress = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any)
        .from("profiles_private")
        .update({
          address: null,
          postal_code: null,
          city: null,
          country: null,
          address_consent_at: null,
        })
        .eq("user_id", user!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Din adresse er slettet.");
      qc.invalidateQueries({ queryKey: ["address-consent-state", user?.id] });
      qc.invalidateQueries({ queryKey: ["my-profile", user?.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!user || !data) return null;
  const hasAddress = !!(data.address || data.postal_code || data.city);
  if (!hasAddress) return null;
  if (data.address_consent_at) return null;

  const busy = giveConsent.isPending || clearAddress.isPending;

  return (
    <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-300">
          <ShieldAlert className="h-5 w-5" />
        </div>
        <div className="flex-1 space-y-3">
          <div>
            <p className="text-sm font-semibold">Bekræft samtykke til opbevaring af din adresse</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Vi har din adresse liggende, så vi kan sende dig en eventuel præmie. For at
              overholde GDPR har vi brug for dit aktive samtykke. Du kan altid trække
              samtykket tilbage igen under <Link to="/profil" className="underline">Min profil</Link>.
              Adressen slettes også automatisk hvis din konto er inaktiv i mere end 1 år. Se{" "}
              <Link to="/privatlivspolitik" className="underline">privatlivspolitikken</Link>.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={() => giveConsent.mutate()}
              disabled={busy}
              className="gap-2"
            >
              {giveConsent.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Jeg giver samtykke
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                if (!confirm("Slet din adresse permanent? Du kan altid tilføje den igen senere.")) return;
                clearAddress.mutate();
              }}
              disabled={busy}
              className="gap-2"
            >
              {clearAddress.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Slet min adresse
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
