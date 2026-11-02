import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { getSession, setCompanySheet } from "@/lib/auth.functions";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/planilha-empresa")({
  head: () => ({
    meta: [
      { title: "Planilha da empresa — Gestão de Serviços" },
      { name: "description", content: "Informe o link da planilha Google onde os lançamentos da sua empresa serão salvos." },
      { property: "og:title", content: "Planilha da empresa — Gestão de Serviços" },
      { property: "og:description", content: "Ligue sua empresa à planilha de lançamentos." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  beforeLoad: async () => {
    const session = await getSession();
    if (!session) throw redirect({ to: "/login" });
    return { session };
  },
  component: SheetPage,
});

function SheetPage() {
  const { session } = Route.useRouteContext();
  const fn = useServerFn(setCompanySheet);
  const navigate = useNavigate();
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await fn({ data: { link } });
      toast.success("Planilha ligada com sucesso!");
      navigate({ to: "/", replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível salvar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <form onSubmit={submit} className="w-full max-w-md space-y-4 rounded-xl border bg-card p-6 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold">Olá, {session.empresa}</h1>
          <p className="text-sm text-muted-foreground">
            Cole o link da planilha Google onde os lançamentos da sua empresa serão salvos. As abas necessárias serão criadas automaticamente.
          </p>
        </div>
        <input className="field w-full" placeholder="https://docs.google.com/spreadsheets/d/..." value={link} onChange={(e) => setLink(e.target.value)} required />
        <Button type="submit" className="w-full" disabled={busy}>{busy ? "Verificando..." : "Salvar e continuar"}</Button>
      </form>
    </div>
  );
}
