import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type PointsSystem = {
  points_per_position?: number[];
  fastest_lap_points?: number;
};

export const DEFAULT_POINTS: number[] = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];

export function PointsSystemEditor({
  value,
  onChange,
}: {
  value: PointsSystem;
  onChange: (next: PointsSystem) => void;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [saveOpen, setSaveOpen] = useState(false);
  const [tplName, setTplName] = useState("");
  const [tplDesc, setTplDesc] = useState("");
  const [selectedTpl, setSelectedTpl] = useState<string>("");

  const points = (value.points_per_position && value.points_per_position.length > 0
    ? value.points_per_position
    : DEFAULT_POINTS).map((n) => Number(n) || 0);
  const flPoints = Number(value.fastest_lap_points ?? 1);

  const { data: templates } = useQuery({
    queryKey: ["points-templates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("points_system_templates")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const setPos = (i: number, v: number) => {
    const next = [...points];
    next[i] = Math.max(0, v | 0);
    onChange({ ...value, points_per_position: next });
  };
  const addPos = () =>
    onChange({ ...value, points_per_position: [...points, 0] });
  const removePos = (i: number) =>
    onChange({
      ...value,
      points_per_position: points.filter((_, idx) => idx !== i),
    });

  const applyTemplate = async (id: string) => {
    setSelectedTpl(id);
    const tpl = templates?.find((t: any) => t.id === id);
    if (!tpl) return;
    onChange({
      points_per_position: (tpl.points_per_position ?? []).map((n: any) => Number(n) || 0),
      fastest_lap_points: Number(tpl.fastest_lap_points ?? 0),
    });
    toast.success(`Indlæst "${tpl.name}"`);
  };

  const saveTemplate = async () => {
    if (!tplName.trim()) return toast.error("Navn er påkrævet.");
    const { error } = await supabase.from("points_system_templates").insert({
      name: tplName.trim(),
      description: tplDesc.trim() || null,
      points_per_position: points,
      fastest_lap_points: flPoints,
      created_by: user?.id ?? null,
    });
    if (error) return toast.error(error.message);
    toast.success("Arkiveret");
    setTplName("");
    setTplDesc("");
    setSaveOpen(false);
    qc.invalidateQueries({ queryKey: ["points-templates"] });
  };

  const deleteTemplate = async (id: string) => {
    if (!confirm("Slet arkiveret pointsystem?")) return;
    const { error } = await supabase.from("points_system_templates").delete().eq("id", id);
    if (error) return toast.error(error.message);
    if (selectedTpl === id) setSelectedTpl("");
    qc.invalidateQueries({ queryKey: ["points-templates"] });
  };

  return (
    <div className="space-y-2 rounded-md border border-border p-2">
      <div className="flex items-center justify-between gap-2">
        <Label>Pointsystem</Label>
        <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
          <DialogTrigger asChild>
            <Button type="button" size="sm" variant="outline" className="gap-1">
              <Archive className="h-3 w-3" /> Arkivér
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Arkivér pointsystem</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Navn</Label><Input value={tplName} onChange={(e) => setTplName(e.target.value)} maxLength={100} /></div>
              <div><Label>Beskrivelse</Label><Textarea value={tplDesc} onChange={(e) => setTplDesc(e.target.value)} maxLength={500} /></div>
            </div>
            <DialogFooter><Button type="button" onClick={saveTemplate}>Gem</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {templates && templates.length > 0 && (
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <Label className="text-xs">Indlæs fra arkiv</Label>
            <Select value={selectedTpl} onValueChange={applyTemplate}>
              <SelectTrigger><SelectValue placeholder="Vælg arkiveret pointsystem" /></SelectTrigger>
              <SelectContent>
                {templates.map((t: any) => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {selectedTpl && (
            <Button type="button" variant="ghost" size="icon" className="mt-5" onClick={() => deleteTemplate(selectedTpl)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      )}

      <div>
        <Label className="text-xs">FL-point (hurtigste omgang)</Label>
        <Input
          type="number"
          min={0}
          value={flPoints}
          onChange={(e) => onChange({ ...value, fastest_lap_points: Math.max(0, Number(e.target.value) | 0) })}
        />
      </div>

      <div>
        <Label className="text-xs">Point pr. position</Label>
        <div className="grid grid-cols-3 gap-1 sm:grid-cols-5">
          {points.map((p, i) => (
            <div key={i} className="flex items-center gap-1">
              <span className="w-6 text-right text-xs text-muted-foreground">{i + 1}.</span>
              <Input
                className="h-8"
                type="number"
                min={0}
                value={p}
                onChange={(e) => setPos(i, Number(e.target.value))}
              />
              <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => removePos(i)}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
        <Button type="button" variant="outline" size="sm" className="mt-2 gap-1" onClick={addPos}>
          <Plus className="h-3 w-3" /> Tilføj position
        </Button>
      </div>
    </div>
  );
}
