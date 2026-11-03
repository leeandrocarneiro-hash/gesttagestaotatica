import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { doLogin, doRegisterCompany } from "@/lib/auth.functions";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Acesso — GESTTA" }, { name: "description", content: "Entre ou cadastre sua empresa no GESTTA." }] }),
  component: LoginPage,
});

function LoginPage() {
  const loginFn = useServerFn(doLogin);
  const registerFn = useServerFn(doRegisterCompany);
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [companyName, setCompanyName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "register") {
        const result = await registerFn({ data: { companyName, displayName, email, password } });
        if (result.needsEmailConfirmation) {
          toast.success("Cadastro iniciado. Confirme seu e-mail e depois entre no sistema.");
          setMode("login");
        } else {
          toast.success("Empresa cadastrada!");
          navigate({ to: "/planilha-empresa", replace: true });
        }
      } else {
        const result = await loginFn({ data: { login: email, senha: password } });
        navigate({ to: result.needsSheet ? "/planilha-empresa" : "/", replace: true });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível concluir o acesso.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <section className="w-full max-w-md space-y-5 rounded-xl border bg-card p-6 shadow-sm">
        <header className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">GESTTA</h1>
          <p className="text-sm text-muted-foreground">Gestão inteligente para sua empresa.</p>
        </header>
        <div className="grid grid-cols-2 rounded-lg bg-muted p-1">
          <button type="button" onClick={() => setMode("login")} className={`rounded-md px-3 py-2 text-sm font-medium ${mode === "login" ? "bg-background shadow" : "text-muted-foreground"}`}>Entrar</button>
          <button type="button" onClick={() => setMode("register")} className={`rounded-md px-3 py-2 text-sm font-medium ${mode === "register" ? "bg-background shadow" : "text-muted-foreground"}`}>Criar conta</button>
        </div>
        <form onSubmit={submit} className="space-y-4">
          {mode === "register" && <>
            <label className="block space-y-1 text-sm"><span>Nome da empresa</span><input className="field w-full" value={companyName} onChange={e => setCompanyName(e.target.value)} autoComplete="organization" required minLength={2} /></label>
            <label className="block space-y-1 text-sm"><span>Seu nome</span><input className="field w-full" value={displayName} onChange={e => setDisplayName(e.target.value)} autoComplete="name" required minLength={2} /></label>
          </>}
          <label className="block space-y-1 text-sm"><span>E-mail de acesso</span><input className="field w-full" type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="username" required /></label>
          <label className="block space-y-1 text-sm"><span>Senha</span><input className="field w-full" type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete={mode === "register" ? "new-password" : "current-password"} required minLength={mode === "register" ? 12 : 1} /></label>
          {mode === "register" && <p className="text-xs text-muted-foreground">Use uma senha com pelo menos 12 caracteres. Após criar a conta, você poderá conectar a planilha da empresa.</p>}
          <Button type="submit" className="w-full" disabled={busy}>{busy ? "Aguarde..." : mode === "login" ? "Entrar" : "Criar conta da empresa"}</Button>
        </form>
      </section>
    </main>
  );
}
