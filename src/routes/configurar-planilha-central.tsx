import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { initializeCentralSpreadsheet } from "@/lib/central-sheet.functions";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/configurar-planilha-central")({
  head: () => ({ meta: [{ title: "Configurar planilha central | GESTTA" }] }),
  component: ConfigureCentralSpreadsheet,
});

function ConfigureCentralSpreadsheet() {
  const initialize = useServerFn(initializeCentralSpreadsheet);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Array<{ tab: string; status: "created" | "already_configured" }> | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setResult(null);
    try {
      const response = await initialize({ data: { setupToken: token } });
      setResult(response.results);
      toast.success("Verificação da planilha central concluída.");
      setToken("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível configurar a planilha.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl items-center px-5 py-12">
      <section className="w-full rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
        <p className="text-sm font-medium text-primary">GESTTA · Configuração inicial</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Preparar planilha central</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Esta etapa verifica as abas Empresas, Solicitacoes, Usuarios e Auditoria. Os cabeçalhos serão inseridos somente quando a primeira linha estiver vazia. Dados e cabeçalhos diferentes nunca serão sobrescritos.
        </p>
        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <label className="block space-y-2">
            <span className="text-sm font-medium">Código temporário de configuração</span>
            <input
              className="h-11 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              type="password"
              autoComplete="off"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              required
              minLength={1}
            />
          </label>
          <Button type="submit" disabled={busy || !token} className="w-full">
            {busy ? "Verificando e configurando..." : "Configurar planilha central"}
          </Button>
        </form>
        {result && (
          <div className="mt-6 rounded-lg border p-4">
            <h2 className="font-medium">Resultado</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {result.map((item) => (
                <li key={item.tab} className="flex items-center justify-between gap-3">
                  <span>{item.tab}</span>
                  <span className="text-muted-foreground">{item.status === "created" ? "Cabeçalhos inseridos" : "Já estava configurada"}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <p className="mt-6 text-xs leading-5 text-muted-foreground">
          Por segurança, o código é validado no servidor e não é armazenado nesta página. Após concluir, remova GESTTA_CENTRAL_SETUP_TOKEN das variáveis do servidor.
        </p>
      </section>
    </main>
  );
}
