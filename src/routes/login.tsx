import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { doLogin } from "@/lib/auth.functions";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Entrar — Gestão de Serviços" },
      { name: "description", content: "Acesse a área da sua empresa para lançar serviços, custos e recebimentos." },
      { property: "og:title", content: "Entrar — Gestão de Serviços" },
      { property: "og:description", content: "Área de acesso de cada empresa." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const fn = useServerFn(doLogin);
  const navigate = useNavigate();
  const [login, setLogin] = useState("");
  const [senha, setSenha] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await fn({ data: { login, senha } });
      navigate({ to: r.needsSheet ? "/planilha-empresa" : "/", replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível entrar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-xl border bg-card p-6 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold">Gestão de Serviços</h1>
          <p className="text-sm text-muted-foreground">Entre com o usuário e a senha cadastrados pela equipe GESTTA. No primeiro acesso, você será orientado a conectar sua planilha Google.</p>
        </div>
        <label className="block space-y-1 text-sm">
          <span>Usuário (e-mail cadastrado)</span>
          <input className="field w-full" type="text" value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="username" placeholder="Digite o usuário recebido do GESTTA" required />
        </label>
        <label className="block space-y-1 text-sm">
          <span>Senha</span>
          <input className="field w-full" type="password" value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete="current-password" required />
        </label>
        <Button type="submit" className="w-full" disabled={busy}>{busy ? "Entrando..." : "Entrar"}</Button>
      </form>
    </div>
  );
}
