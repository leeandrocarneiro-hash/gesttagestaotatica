import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { beginGoogleLogin, doLogin, registerCompany } from "@/lib/auth.functions";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Acesso — GESTTA" }, { name: "description", content: "Entre ou cadastre sua empresa no GESTTA." }] }),
  component: LoginPage,
});

function LoginPage() {
  const loginFn = useServerFn(doLogin);
  const registerFn = useServerFn(registerCompany);\n  const googleLoginFn = useServerFn(beginGoogleLogin);
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [companyName, setCompanyName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function loginWithGoogle() {\n    setBusy(true);\n    try {\n      const result = await googleLoginFn();\n      window.location.assign(result.url);\n    } catch (error) {\n      toast.error(error instanceof Error ? error.message : "Não foi possível iniciar o login Google.");\n      setBusy(false);\n    }\n  }\n\n  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      if (mode === "register") {
        await registerFn({ data: { companyName, displayName, email, password } });
        toast.success("Empresa cadastrada e planilha criada!");
      } else {
        await loginFn({ data: { login: email, senha: password } });
      }
      navigate({ to: "/", replace: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível concluir o acesso.");
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
        {mode === "login" && <div className="space-y-3">\n          <Button type="button" variant="outline" className="w-full" disabled={busy} onClick={loginWithGoogle}>\n            <svg aria-hidden="true" viewBox="0 0 48 48" className="mr-2 h-5 w-5"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.02 13.22l7.98 6.19C11.9 13.72 17.45 9.5 24 9.5Z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.76 7.18l7.73 6C44.42 37.86 46.98 31.7 46.98 24.55Z"/><path fill="#FBBC05" d="M10 28.59a14.4 14.4 0 0 1 0-9.18l-7.98-6.19a24 24 0 0 0 0 21.56l7.98-6.19Z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.91-5.8l-7.73-6c-2.14 1.44-4.88 2.3-8.18 2.3-6.55 0-12.1-4.22-14-9.99l-7.98 6.19C6.51 42.62 14.62 48 24 48Z"/></svg>\n            Continuar com Google\n          </Button>\n          <div className="relative py-1 text-center text-xs text-muted-foreground"><span className="bg-card px-2">ou entre com e-mail</span><div className="absolute inset-x-0 top-1/2 -z-10 border-t" /></div>\n        </div>}\n        <form onSubmit={submit} className="space-y-4">
          {mode === "register" && <>
            <label className="block space-y-1 text-sm"><span>Nome da empresa</span><input className="field w-full" value={companyName} onChange={e => setCompanyName(e.target.value)} autoComplete="organization" required minLength={2} maxLength={120} /></label>
            <label className="block space-y-1 text-sm"><span>Nome do responsável</span><input className="field w-full" value={displayName} onChange={e => setDisplayName(e.target.value)} autoComplete="name" required minLength={2} maxLength={120} /></label>
          </>}
          <label className="block space-y-1 text-sm"><span>E-mail</span><input className="field w-full" type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="username" required maxLength={200} /></label>
          <label className="block space-y-1 text-sm"><span>Senha</span><input className="field w-full" type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete={mode === "register" ? "new-password" : "current-password"} required minLength={mode === "register" ? 12 : 1} maxLength={200} /></label>
          {mode === "register" && <p className="text-xs text-muted-foreground">Use pelo menos 12 caracteres. Uma planilha exclusiva será criada para sua empresa.</p>}
          <Button type="submit" className="w-full" disabled={busy}>{busy ? "Aguarde..." : mode === "login" ? "Entrar" : "Criar conta da empresa"}</Button>
        </form>
      </section>
    </main>
  );
}
