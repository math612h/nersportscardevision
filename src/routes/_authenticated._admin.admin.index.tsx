import { createFileRoute, Link } from "@tanstack/react-router";
import { Shield, Flag, MessageSquareWarning, Users } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/_admin/admin/")({
  component: AdminHub,
});

function AdminHub() {
  const items = [
    { to: "/admin/ligaer", title: "Ligaer & afdelinger", desc: "Opret og rediger ligaer, afdelinger, regler og entries.", icon: Flag },
    { to: "/admin/protests", title: "Protests", desc: "Se alle indsendte protests.", icon: MessageSquareWarning },
    { to: "/admin/brugere", title: "Brugere", desc: "Administrér alle brugere på platformen.", icon: Users },
  ];
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2"><Shield className="h-6 w-6 text-primary" /><h1 className="text-2xl font-bold">Admin</h1></div>
      <div className="grid gap-3 sm:grid-cols-2">
        {items.map((i) => (
          <Link key={i.to} to={i.to}>
            <Card className="cursor-pointer transition hover:border-primary">
              <CardHeader>
                <div className="flex items-center gap-2"><i.icon className="h-5 w-5 text-primary" /><CardTitle>{i.title}</CardTitle></div>
                <CardDescription>{i.desc}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
