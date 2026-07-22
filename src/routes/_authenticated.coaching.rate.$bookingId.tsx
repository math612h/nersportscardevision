import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Star, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { getBookingForRating, submitCoachingRating } from "@/lib/coaching.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/coaching/rate/$bookingId")({
  component: RateCoachingPage,
});

function RateCoachingPage() {
  const { bookingId } = Route.useParams();
  const navigate = useNavigate();
  const getFn = useServerFn(getBookingForRating);
  const submitFn = useServerFn(submitCoachingRating);

  const { data, isLoading, error } = useQuery({
    queryKey: ["rate-booking", bookingId],
    queryFn: () => getFn({ data: { booking_id: bookingId } }),
  });

  const [stars, setStars] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");

  useEffect(() => {
    if (data?.existing) {
      setStars(data.existing.stars ?? 0);
      setComment(data.existing.comment ?? "");
    }
  }, [data]);

  const mut = useMutation({
    mutationFn: () => submitFn({ data: { booking_id: bookingId, stars, comment } }),
    onSuccess: () => {
      toast.success("Tak for din bedømmelse!");
      navigate({ to: "/coaching/mine-bookinger" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <div className="p-8 text-center text-muted-foreground">Indlæser…</div>;
  if (error) {
    return (
      <div className="mx-auto max-w-xl px-4 py-12 text-center">
        <h1 className="text-xl font-bold">Kunne ikke indlæse</h1>
        <p className="mt-2 text-sm text-muted-foreground">{(error as Error).message}</p>
        <Button asChild variant="outline" className="mt-6"><Link to="/coaching/mine-bookinger">Tilbage</Link></Button>
      </div>
    );
  }

  const coach = data?.coach;
  const active = hover || stars;

  return (
    <div className="mx-auto max-w-xl px-4 py-8">
      <Button asChild variant="ghost" size="sm" className="mb-4"><Link to="/coaching/mine-bookinger"><ArrowLeft className="mr-1 h-4 w-4" /> Mine bookinger</Link></Button>
      <Card>
        <CardHeader>
          <CardTitle>Rat din session</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {coach && (
            <div className="flex items-center gap-3">
              <Avatar className="h-12 w-12">
                {coach.avatar_url && <AvatarImage src={coach.avatar_url} />}
                <AvatarFallback>{coach.display_name?.[0] ?? "?"}</AvatarFallback>
              </Avatar>
              <div>
                <div className="text-sm text-muted-foreground">Coach</div>
                <div className="font-semibold">{coach.display_name}</div>
              </div>
            </div>
          )}

          <div>
            <div className="mb-2 text-sm font-medium">Hvor god var din session?</div>
            <div className="flex gap-1" onMouseLeave={() => setHover(0)}>
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onMouseEnter={() => setHover(n)}
                  onClick={() => setStars(n)}
                  className="p-1"
                  aria-label={`${n} stjerner`}
                >
                  <Star className={cn("h-9 w-9 transition-colors", n <= active ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground/40")} />
                </button>
              ))}
            </div>
            {stars > 0 && <p className="mt-2 text-xs text-muted-foreground">{stars} af 5 stjerner</p>}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Kommentar (valgfri)</label>
            <Textarea
              rows={5}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Hvad var særligt godt? Hvad kunne være bedre?"
              maxLength={2000}
            />
            <div className="mt-1 text-right text-xs text-muted-foreground">{comment.length}/2000</div>
          </div>

          <Button
            onClick={() => mut.mutate()}
            disabled={mut.isPending || stars === 0}
            className="w-full"
          >
            {data?.existing ? "Opdater bedømmelse" : "Send bedømmelse"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
