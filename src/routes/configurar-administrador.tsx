import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { bootstrapGeneralAdmin } from "@/lib/central-sheet.functions";

export const Route = createFileRoute("/configurar-administrador")({
  head: () => ({ meta: [{ title: "Configurar administrador geral | GESTTA" }] }),
  component: BootstrapAdminPage,
});

function BootstrapAdminPage() {
  const bootstrap = useServerFn(bootstrapGeneralAdmin);
  const navigate = useNavigate();
  const [token, setToken] = useState("");
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      await bootstrap({ data: { setupToken: token, nome, email, senha } });
      setToken("");
      setSenha("");
      toast.success("Administrador geral cadastrado. Remova o token temporário das variáveis do servidor.");
      navigate({ to: "/acesso-administrador", replace: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível configurar o administrador.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl items-center px-5 py-12">
      <form onSubmit={submit} className="w-full space-y-4 rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
        <p className="text-sm font-medium text-primary">GESTTA · Configuração protegida</p>
        <h1 className="text-2xl font-semibold">Criar administrador geral</h1>
        <p className="text-sm text-muted-foreground">Cadastro inicial de uso único. O e-mail precisa ser igual ao definido em GESTTA_BOOTSTRAP_ADMIN_EMAIL no servidor.</p>
        <label className="block space-y-1 text-sm">Nome
          <input className="field w-full" value={nome} onChange={(e) => setNome(e.target.value)} autoComplete="name" required minLength={2} maxLength={120} />
        </label>
        <label className="block space-y-1 text-sm">E-mail autorizado
          <input className="field w-full" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
        </label>
        <label className="block space-y-1 text-sm">Senha inicial (12 a 200 caracteres)
          <input className="field w-full" type="password" value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete="new-password" required minLength={12} maxLength={200} />
        </label>
        <label className="block space-y-1 text-sm">Token temporário de configuração
          <input className="field w-full" type="password" value={token} onChange={(e) => setToken(e.target.value)} autoComplete="off" required />
        </label>
        <Button type="submit" className="w-full" disabled={busy}>{busy ? "Criando administrador..." : "Criar administrador geral"}</Button>
        <p className="text-xs text-muted-foreground">A senha será armazenada como hash PBKDF2 com salt individual. O token não é gravado na planilha.</p>
      </form>
    </main>
  );
}
