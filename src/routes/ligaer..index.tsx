
function EditEntryDialog({ leagueId }: { leagueId: string }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: signups } = useLeagueSignups(leagueId);
  const { data: myTeams } = useMyTeams(user?.id);
  const [open, setOpen] = useState(false);

  const myEntry = useMemo(
    () => (signups ?? []).find((s) => user && s.user_id === user.id) as any,
    [signups, user],
  );

  const { data: divs } = useQuery({
    queryKey: ["league-divisions-completed", leagueId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("divisions")
        .select("id,settings")
        .eq("league_id", leagueId);
      if (error) throw error;
      return data ?? [];
    },
  });
  const locked = (divs ?? []).some((d: any) => !!d?.settings?.completed);

  const [carModel, setCarModel] = useState<string>("");
  const [teamId, setTeamId] = useState<string>("");

  useEffect(() => {
    if (myEntry) {
      setCarModel(myEntry.car_model ?? "");
      setTeamId(myEntry.team_id ?? "");
    }
  }, [myEntry?.id]);

  if (!user || !myEntry) return null;

  const cars = CARS_BY_CLASS[myEntry.car_class] ?? [];

  const save = async () => {
    if (locked) return toast.error("Første afdeling er kørt – bilvalg er låst.");
    if (!carModel) return toast.error("Vælg din bil.");
    const { error } = await (supabase as any)
      .from("entries")
      .update({ car_model: carModel, team_id: teamId || null })
      .eq("id", myEntry.id);
    if (error) return toast.error(error.message);
    toast.success("Tilmelding opdateret.");
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["league-signups", leagueId] });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-2">
          <SettingsIcon className="h-4 w-4" /> Rediger tilmelding
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Rediger din tilmelding</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="rounded-md border border-border bg-muted/40 p-2 text-xs text-muted-foreground">
            {myEntry.car_class} · #{myEntry.car_number}
          </div>
          {cars.length > 0 && (
            <div>
              <Label>Bil</Label>
              <Select value={carModel} onValueChange={setCarModel} disabled={locked}>
                <SelectTrigger><SelectValue placeholder={`Vælg ${myEntry.car_class}-bil`} /></SelectTrigger>
                <SelectContent>
                  {cars.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label>Team</Label>
            <Select value={teamId || "none"} onValueChange={(v) => setTeamId(v === "none" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Intet team" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Intet team</SelectItem>
                {(myTeams ?? []).map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {locked && (
            <p className="rounded-md border border-dashed border-border bg-muted/40 p-2 text-xs text-muted-foreground">
              Første afdeling er kørt – bilvalg kan ikke længere ændres.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button onClick={save} disabled={locked && carModel === (myEntry.car_model ?? "")}>Gem</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
