import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createGroup, searchUsers } from "@/lib/messages.functions";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { UserAvatarOnly } from "@/components/UserAvatar";
import { X } from "lucide-react";
import { toast } from "sonner";

export function CreateGroupDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: (groupId: string) => void;
}) {
  const [name, setName] = useState("");
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Array<{ id: string; display_name: string | null }>>([]);
  const [creating, setCreating] = useState(false);

  const { data: search } = useQuery({
    queryKey: ["new-grp-search", q],
    enabled: open && q.trim().length >= 1,
    queryFn: () => searchUsers({ data: { q: q.trim() } }),
  });

  const reset = () => {
    setName("");
    setQ("");
    setPicked([]);
  };

  const add = (u: any) => {
    if (picked.find((p) => p.id === u.id)) return;
    setPicked([...picked, { id: u.id, display_name: u.display_name }]);
    setQ("");
  };

  const remove = (id: string) => setPicked(picked.filter((p) => p.id !== id));

  const create = async () => {
    if (!name.trim() || picked.length === 0) return;
    setCreating(true);
    try {
      const res = await createGroup({
        data: { name: name.trim(), memberIds: picked.map((p) => p.id) },
      });
      toast.success("Gruppe oprettet");
      reset();
      onOpenChange(false);
      onCreated(res.groupId);
    } catch (e: any) {
      toast.error(e?.message ?? "Kunne ikke oprette gruppe");
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ny gruppe</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium">Gruppenavn</label>
            <Input
              placeholder="Fx Team Alpha"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              autoFocus
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium">
              Medlemmer {picked.length > 0 && `(${picked.length})`}
            </label>
            {picked.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1">
                {picked.map((p) => (
                  <span
                    key={p.id}
                    className="inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-xs"
                  >
                    {p.display_name ?? "Ukendt"}
                    <button onClick={() => remove(p.id)} aria-label="Fjern">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <Input
              placeholder="Søg bruger…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            {search?.users && search.users.length > 0 && (
              <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto rounded-md border border-border">
                {search.users
                  .filter((u: any) => !picked.find((p) => p.id === u.id))
                  .map((u: any) => (
                    <li key={u.id} className="flex items-center gap-2 px-2 py-1.5">
                      <UserAvatarOnly userId={u.id} fallbackName={u.display_name ?? "?"} size="sm" />
                      <span className="flex-1 truncate text-sm">{u.display_name ?? "Ukendt"}</span>
                      <Button variant="ghost" size="sm" onClick={() => add(u)}>
                        Tilføj
                      </Button>
                    </li>
                  ))}
              </ul>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annullér
          </Button>
          <Button onClick={create} disabled={!name.trim() || picked.length === 0 || creating}>
            {creating ? "Opretter…" : "Opret gruppe"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
