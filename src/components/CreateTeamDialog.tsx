import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Plus } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";

export function CreateTeamDialog({ trigger }: { trigger?: React.ReactNode }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");

  const create = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Du skal være logget ind.");
      const trimmed = name.trim();
      if (trimmed.length < 2) throw new Error("Teamnavnet skal være mindst 2 tegn.");
      if (trimmed.length > 60) throw new Error("Teamnavnet må højst være 60 tegn.");
      const { data, error } = await supabase
        .from("teams" as any)
        .insert({ name: trimmed, bio: bio.trim() || null, owner_id: user.id })
        .select("id")
        .single();
      if (error) throw error;
      return (data as any).id as string;
    },
    onSuccess: async (id) => {
      // Backfill existing sign-ups without a team to the newly created team
      if (user) {
        await (supabase as any)
          .from("entries")
          .update({ team_id: id })
          .eq("user_id", user.id)
          .is("team_id", null);
      }
      toast.success("Team oprettet!");
      qc.invalidateQueries({ queryKey: ["teams"] });
      qc.invalidateQueries({ queryKey: ["my-teams"] });
      qc.invalidateQueries({ queryKey: ["league-signups"] });
      qc.invalidateQueries({ queryKey: ["teams-by-id"] });
      setOpen(false);
      setName("");
      setBio("");
      navigate({ to: "/teams/$teamId", params: { teamId: id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm" className="gap-1"><Plus className="h-4 w-4" /> Opret team</Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Opret nyt team</DialogTitle>
          <DialogDescription>
            Du bliver automatisk ejer og medlem. Du kan maks være medlem af 3 teams.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Teamnavn</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Mit team" />
          </div>
          <div>
            <Label>Bio (valgfri)</Label>
            <Textarea value={bio} onChange={(e) => setBio(e.target.value)} maxLength={500} rows={3} placeholder="Lidt om holdet…" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Annullér</Button>
          <Button onClick={() => create.mutate()} disabled={create.isPending}>
            {create.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Opret
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
