import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { doLogin, registerCompany, requestPasswordReset, updateRecoveredPassword } from "@/lib/auth.functions";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Acesso — GESTTA" }, { name: "description", content: "Entre ou cadastre sua empresa no GESTTA." }] }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [companyName, setCompanyName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [recovery, setRecovery] = useState(false);
  const [newPassword, setNewPassword] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("recovery") === "1" || window.location.hash.includes("type=recovery")) setRecovery(true);
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      if (mode === "register") {
        const result = await registerCompany({ data: { companyName, displayName, email, password } });
        if (result.confirmationRequired) {
          toast.success("Cadastro recebido! Confirme seu e-mail para acessar o GESTTA.");
          setMode("login");
          return;
        }
        toast.success("Empresa cadastrada com sucesso!");
      } else {
        if (recovery) {
          await updateRecoveredPassword(newPassword);
          toast.success("Senha atualizada. Entre com sua nova senha.");
          setRecovery(false);
          setPassword("");
          setNewPassword("");
          return;
        }
        await doLogin({ data: { login: email, senha: password } });
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
        <form onSubmit={submit} className="space-y-4">
          {mode === "register" && <>
            <label className="block space-y-1 text-sm"><span>Nome da empresa</span><input className="field w-full" value={companyName} onChange={e => setCompanyName(e.target.value)} autoComplete="organization" required minLength={2} maxLength={120} /></label>
            <label className="block space-y-1 text-sm"><span>Nome do responsável</span><input className="field w-full" value={displayName} onChange={e => setDisplayName(e.target.value)} autoComplete="name" required minLength={2} maxLength={120} /></label>
          </>}
          <label className="block space-y-1 text-sm"><span>E-mail</span><input className="field w-full" type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="username" required maxLength={200} /></label>
          <label className="block space-y-1 text-sm"><span>Senha</span><input className="field w-full" type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete={mode === "register" ? "new-password" : "current-password"} required minLength={mode === "register" ? 12 : 1} maxLength={200} /></label>
          {mode === "register" && <p className="text-xs text-muted-foreground">Use pelo menos 12 caracteres. Os dados da sua empresa ficarão separados dos demais clientes.</p>}
          {recovery && <label className="block space-y-1 text-sm"><span>Nova senha</span><input className="field w-full" type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} minLength={12} required autoComplete="new-password" /></label>}
          {mode === "login" && !recovery && <button type="button" className="text-sm text-primary underline" onClick={async () => { try { await requestPasswordReset(email); toast.success("Se o e-mail estiver cadastrado, você receberá o link de recuperação."); } catch (e) { toast.error(e instanceof Error ? e.message : "Não foi possível solicitar a recuperação."); } }}>Esqueci minha senha</button>}
          {recovery && <button type="button" className="text-sm text-primary underline" onClick={() => setRecovery(false)}>Voltar ao login</button>}
          <Button type="submit" className="w-full" disabled={busy}>{busy ? "Aguarde..." : recovery ? "Salvar nova senha" : mode === "login" ? "Entrar" : "Criar conta da empresa"}</Button>
        </form>
      </section>
    </main>
  );
}
