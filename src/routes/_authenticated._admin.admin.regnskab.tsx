import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/use-auth";
import { getFinanceMe } from "@/lib/finance/finance.functions";
import { OverviewTab } from "@/components/finance/OverviewTab";
import { SetupTab, RolesCard } from "@/components/finance/SetupTab";
import { JournalTab } from "@/components/finance/JournalTab";
import { OpeningTab } from "@/components/finance/OpeningTab";
import { StripeTab } from "@/components/finance/StripeTab";
import { BankTab } from "@/components/finance/BankTab";
import { ExpensesTab } from "@/components/finance/ExpensesTab";
import { ClaimsTab } from "@/components/finance/ClaimsTab";
import { BackupTab, GuideTab, LogTab, PeriodsTab, ReportsTab, RulesTab } from "@/components/finance/MoreTabs";

export const Route = createFileRoute("/_authenticated/_admin/admin/regnskab")({
  head: () => ({ meta: [{ title: "Regnskab – LMU Danmark" }, { name: "robots", content: "noindex" }] }),
  component: FinancePage,
});

const TABS: [string, string][] = [
  ["overblik", "Overblik"], ["journal", "Kassekladde"], ["aabning", "Åbning"], ["stripe", "Stripe"], ["bank", "Bank"],
  ["udgifter", "Fakturaer og bilag"], ["udlaeg", "Udlæg"], ["regler", "Regler"], ["rapporter", "Rapporter"],
  ["perioder", "Perioder"], ["backup", "Backup"], ["opsaetning", "Opsætning"], ["log", "Log"], ["guide", "Guide"],
];

function FinancePage() {
  const { user, isAdmin } = useAuth();
  const me = useServerFn(getFinanceMe);
  const { data, isLoading } = useQuery({ queryKey: ["fin", "me"], queryFn: () => me() });
  const [tab, setTab] = useState("overblik");
  if (isLoading) return <p className="p-6 text-muted-foreground">Indlæser…</p>;
  const roles = data?.roles ?? [];
  const isFinAdmin = roles.includes("finance_admin");
  if (roles.length === 0) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 p-6">
        <h1 className="text-2xl font-semibold">Regnskab</h1>
        <p className="text-muted-foreground">Du har ikke økonomiadgang. {isAdmin ? "Som administrator kan du tildele økonomirettigheder – også til dig selv." : "Kontakt en administrator."}</p>
        {isAdmin && <RolesCard />}
      </div>
    );
  }
  return (
    <div className="space-y-4 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold">Regnskab</h1>
        <p className="text-sm text-muted-foreground">Dobbelt bogholderi for LMUdanmark. {isFinAdmin ? "Du er kasserer." : "Du har læse- og godkendelsesadgang."}</p>
      </div>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="h-auto flex-wrap justify-start">{TABS.map(([k, l]) => <TabsTrigger key={k} value={k}>{l}</TabsTrigger>)}</TabsList>
        <TabsContent value="overblik"><OverviewTab go={setTab} /></TabsContent>
        <TabsContent value="journal"><JournalTab isFinAdmin={isFinAdmin} /></TabsContent>
        <TabsContent value="aabning"><OpeningTab isFinAdmin={isFinAdmin} userId={user?.id ?? ""} /></TabsContent>
        <TabsContent value="stripe"><StripeTab isFinAdmin={isFinAdmin} /></TabsContent>
        <TabsContent value="bank"><BankTab isFinAdmin={isFinAdmin} /></TabsContent>
        <TabsContent value="udgifter"><ExpensesTab isFinAdmin={isFinAdmin} /></TabsContent>
        <TabsContent value="udlaeg"><ClaimsTab userId={user?.id ?? ""} /></TabsContent>
        <TabsContent value="regler"><RulesTab isFinAdmin={isFinAdmin} /></TabsContent>
        <TabsContent value="rapporter"><ReportsTab /></TabsContent>
        <TabsContent value="perioder"><PeriodsTab isFinAdmin={isFinAdmin} /></TabsContent>
        <TabsContent value="backup"><BackupTab isFinAdmin={isFinAdmin} /></TabsContent>
        <TabsContent value="opsaetning"><SetupTab isFinAdmin={isFinAdmin} />{isAdmin && <div className="mt-4"><RolesCard /></div>}</TabsContent>
        <TabsContent value="log"><LogTab /></TabsContent>
        <TabsContent value="guide"><GuideTab /></TabsContent>
      </Tabs>
    </div>
  );
}
