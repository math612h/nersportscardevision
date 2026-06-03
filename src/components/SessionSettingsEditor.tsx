import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EVENT_NUMERIC_FIELDS, type EventSettings } from "@/lib/tracks";

export function SessionSettingsEditor({ value, onChange }: { value: EventSettings; onChange: (next: EventSettings) => void }) {
  const patch = (p: Partial<EventSettings>) => onChange({ ...value, ...p });
  return (
    <div className="space-y-2 rounded-md border border-border p-2">
      <Label>Event settings</Label>
      <div className="grid grid-cols-2 gap-2">
        {EVENT_NUMERIC_FIELDS.map((f) => (
          <div key={f.key}>
            <Label className="text-xs">{f.label}{f.suffix ? ` (${f.suffix})` : ""}</Label>
            <Input
              type="number"
              min={f.min}
              step={f.step ?? 1}
              value={(value[f.key] as number | undefined) ?? ""}
              placeholder="–"
              onChange={(e) => patch({ [f.key]: e.target.value === "" ? undefined : Number(e.target.value) } as Partial<EventSettings>)}
            />
          </div>
        ))}
        <div className="col-span-2">
          <Label className="text-xs">In-game tid (HH:MM)</Label>
          <Input
            type="time"
            value={value.in_game_time ?? ""}
            onChange={(e) => patch({ in_game_time: e.target.value || undefined })}
          />
        </div>
      </div>
    </div>
  );
}
