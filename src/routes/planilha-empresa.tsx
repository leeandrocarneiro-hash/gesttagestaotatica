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
    if (session.papel !== "company_admin") throw redirect({ to: "/" });
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
            No primeiro acesso, conecte uma planilha Google nova e vazia. O GESTTA criará automaticamente as abas e os cabeçalhos necessários para seus lançamentos.

            <span className="mt-3 block font-medium text-foreground">Antes de continuar:</span>
            <span className="block">1. Crie uma planilha em branco no Google Sheets.</span>
            <span className="block">2. Compartilhe com a conta Google autorizada pelo GESTTA, com permissão de Editor.</span>
            <span className="block">3. Cole aqui o link completo da planilha.</span>
            <span className="mt-2 block">Por segurança, o sistema recusará arquivos que já tenham lançamentos nas abas operacionais.</span>
          </p>
        </div>
        <input className="field w-full" placeholder="https://docs.google.com/spreadsheets/d/..." value={link} onChange={(e) => setLink(e.target.value)} required />
        <Button type="submit" className="w-full" disabled={busy}>{busy ? "Verificando..." : "Salvar e continuar"}</Button>
      </form>
    </div>
  );
}
