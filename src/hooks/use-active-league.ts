import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getActiveLeague } from "@/lib/active-league.functions";

export function useActiveLeague() {
  const fetchActive = useServerFn(getActiveLeague);
  const { data } = useQuery({
    queryKey: ["active-league"],
    queryFn: () => fetchActive(),
    staleTime: 5 * 60_000,
  });
  return data ?? null;
}
