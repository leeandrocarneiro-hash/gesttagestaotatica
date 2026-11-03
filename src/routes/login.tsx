import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { doLogin, getSetupStatus, registerCompany } from "@/lib/auth.functions";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Acesso — GESTTA" }, { name: "description", content: "Acesse a gestão financeira da sua empresa no GESTTA." }] }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [setupRequired, setSetupRequired] = useState(false);
  const [checkingSetup, setCheckingSetup] = useState(true);
  const [mode, setMode] = useState<"login" | "setup">("login");
  const [companyName, setCompanyName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    getSetupStatus()
      .then((result) => {
        if (!active) return;
        setSetupRequired(result.required);
        if (result.required) setMode("setup");
      })
      .catch((error) => {
        if (active) toast.error(error instanceof Error ? error.message : "Não foi possível verificar a configuração.");
      })
      .finally(() => { if (active) setCheckingSetup(false); });
    return () => { active = false; };
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      if (mode === "setup") {
        await registerCompany({ data: { companyName, displayName, email, password } });
        toast.success("Administrador geral criado. Seus registros existentes foram associados à primeira empresa.");
        setSetupRequired(false);
      } else {
        await doLogin({ data: { login: email, senha: password } });
        toast.success("Acesso realizado com sucesso.");
      }
      await navigate({ to: "/", replace: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível concluir o acesso.");
    } finally {
      setBusy(false);
    }
  }

  const settingUp = mode === "setup";

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <section className="w-full max-w-md space-y-5 rounded-xl border bg-card p-6 shadow-sm">
        <header className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">GESTTA</h1>
          <p className="text-sm text-muted-foreground">Gestão inteligente para sua empresa.</p>
        </header>
        {checkingSetup ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Verificando a configuração...</p>
        ) : (
          <>
            {setupRequired && (
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm">
                <p className="font-medium">Configuração inicial</p>
                <p className="mt-1 text-muted-foreground">Crie o administrador geral e cadastre a primeira empresa. Os lançamentos já existentes na planilha serão vinculados a ela.</p>
              </div>
            )}
            <form onSubmit={submit} className="space-y-4">
              {settingUp && (
                <>
                  <label className="block space-y-1 text-sm">
                    <span>Nome da primeira empresa</span>
                    <input className="field w-full" value={companyName} onChange={(e) => setCompanyName(e.target.value)} autoComplete="organization" required minLength={2} maxLength={120} />
                  </label>
                  <label className="block space-y-1 text-sm">
                    <span>Nome do administrador geral</span>
                    <input className="field w-full" value={displayName} onChange={(e) => setDisplayName(e.target.value)} autoComplete="name" required minLength={2} maxLength={120} />
                  </label>
                </>
              )}
              <label className="block space-y-1 text-sm">
                <span>E-mail</span>
                <input className="field w-full" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required maxLength={200} />
              </label>
              <label className="block space-y-1 text-sm">
                <span>Senha</span>
                <input className="field w-full" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={settingUp ? "new-password" : "current-password"} required minLength={settingUp ? 12 : 1} maxLength={200} />
              </label>
              {settingUp && <p className="text-xs text-muted-foreground">Use uma senha com pelo menos 12 caracteres. Ela será armazenada com hash PBKDF2 e salt individual.</p>}
              <Button type="submit" className="w-full" disabled={busy || checkingSetup}>
                {busy ? "Aguarde..." : settingUp ? "Criar administrador geral" : "Entrar"}
              </Button>
            </form>
          </>
        )}
      </section>
    </main>
  );
}
