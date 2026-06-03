import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Users, Pencil, Shield, ShieldOff, ArrowLeft, ThumbsUp, Check } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toggleUserRole } from "@/lib/users.functions";
import { setProfileApproval } from "@/lib/leagues.functions";

export const Route = createFileRoute("/_authenticated/_admin/admin/brugere")({
  component: AdminUsersPage,
});

type Profile = { id: string; display_name: string | null; created_at: string; approved: boolean };
type Role = { user_id: string; role: string };

function AdminUsersPage() {
  const [search, setSearch] = useState("");
  
  const qc = useQueryClient();
  const toggleRole = useServerFn(toggleUserRole);
  const approveFn = useServerFn(setProfileApproval);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-users"],
    queryFn: async () => {
      const [{ data: profiles, error: pErr }, { data: roles, error: rErr }] = await Promise.all([
        supabase.from("profiles").select("id, display_name, created_at, approved").order("created_at", { ascending: false }),
        supabase.from("user_roles").select("user_id, role"),
      ]);
      if (pErr) throw pErr;
      if (rErr) throw rErr;
      return { profiles: (profiles ?? []) as Profile[], roles: (roles ?? []) as Role[] };
    },
  });

  const rolesByUser = new Map<string, string[]>();
  data?.roles.forEach((r) => {
    const arr = rolesByUser.get(r.user_id) ?? [];
    arr.push(r.role);
    rolesByUser.set(r.user_id, arr);
  });

  const filtered = (data?.profiles ?? []).filter((p) => {
    if (!p.approved) return false;
    return (p.display_name ?? "").toLowerCase().includes(search.toLowerCase());
  });

  const roleMut = useMutation({
    mutationFn: async ({ userId, assign }: { userId: string; assign: boolean }) => {
      await toggleRole({ data: { userId, role: "admin", assign } });
    },
    onSuccess: (_, { assign }) => {
      toast.success(assign ? "Admin-rolle tildelt" : "Admin-rolle fjernet");
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const approveMut = useMutation({
    mutationFn: async ({ userId, approved }: { userId: string; approved: boolean }) => {
      await approveFn({ data: { userId, approved } });
    },
    onSuccess: (_, { approved }) => {
      toast.success(approved ? "Profil godkendt" : "Godkendelse fjernet");
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/admin">
          <Button variant="outline" size="icon" aria-label="Tilbage til admin">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <Users className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">Brugere</h1>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Søg efter navn…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <Link to="/admin/afventer">
          <Button type="button" variant="outline" size="sm">Afventer godkendelse</Button>
        </Link>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Indlæser…</p>
      ) : (
        <div className="space-y-2">
          {filtered.map((p) => {
            const userRoles = rolesByUser.get(p.id) ?? ["racer"];
            const isAdmin = userRoles.includes("admin");
            return (
              <Card key={p.id}>
                <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0 py-3">
                  <div className="min-w-0 flex-1">
                    <CardTitle className="truncate text-base">
                      {p.display_name || "(uden navn)"}
                    </CardTitle>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {userRoles.map((r) => (
                        <Badge key={r} variant={r === "admin" ? "default" : "secondary"} className="text-xs">
                          {r === "admin" && <Shield className="mr-1 h-3 w-3" />}
                          {r}
                        </Badge>
                      ))}
                      {p.approved ? (
                        <Badge className="bg-green-600 text-white text-xs"><Check className="mr-1 h-3 w-3" />Godkendt</Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs">Afventer</Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant={p.approved ? "ghost" : "default"}
                      size="icon"
                      aria-label={p.approved ? "Fjern godkendelse" : "Godkend profil"}
                      onClick={() => approveMut.mutate({ userId: p.id, approved: !p.approved })}
                      disabled={approveMut.isPending}
                    >
                      <ThumbsUp className={`h-4 w-4 ${p.approved ? "text-green-600" : ""}`} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={isAdmin ? "Fjern admin-rolle" : "Tildel admin-rolle"}
                      onClick={() => roleMut.mutate({ userId: p.id, assign: !isAdmin })}
                      disabled={roleMut.isPending}
                    >
                      {isAdmin ? (
                        <ShieldOff className="h-4 w-4 text-destructive" />
                      ) : (
                        <Shield className="h-4 w-4" />
                      )}
                    </Button>
                    <EditNameDialog profile={p} />
                  </div>
                </CardHeader>
              </Card>
            );
          })}
          {filtered.length === 0 && (
            <p className="text-muted-foreground">Ingen brugere fundet.</p>
          )}
        </div>
      )}
    </div>
  );
}

function EditNameDialog({ profile }: { profile: Profile }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(profile.display_name ?? "");
  const qc = useQueryClient();

  const mut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("profiles")
        .update({ display_name: name.trim() || null })
        .eq("id", profile.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Navn opdateret");
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Rediger navn">
          <Pencil className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rediger brugernavn</DialogTitle>
        </DialogHeader>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Navn" />
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Annullér</Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>Gem</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
