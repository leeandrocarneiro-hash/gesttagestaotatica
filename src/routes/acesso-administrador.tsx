import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { centralAdminDoLogin } from "@/lib/central-auth.functions";

export const Route = createFileRoute("/acesso-administrador")({
  head: () => ({ meta: [{ title: "Acesso administrativo | GESTTA" }] }),
  component: AdminLoginPage,
});
function AdminLoginPage() {
  const login = useServerFn(centralAdminDoLogin);
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true);
    try {
      const result = await login({ data: { email, senha } });
      if (result.role !== "general_admin") throw new Error("Esta área é exclusiva do administrador geral.");
      navigate({ to: "/admin", replace: true });
    } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível entrar."); }
    finally { setBusy(false); }
  }
  return <main className="flex min-h-screen items-center justify-center bg-background px-4"><form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-xl border bg-card p-6 shadow-sm">
    <div><p className="text-sm font-medium text-primary">GESTTA</p><h1 className="text-2xl font-bold">Administrador geral</h1><p className="text-sm text-muted-foreground">Acesso separado da entrada das empresas.</p></div>
    <label className="block space-y-1 text-sm">E-mail<input className="field w-full" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required /></label>
    <label className="block space-y-1 text-sm">Senha<input className="field w-full" type="password" value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete="current-password" required /></label>
    <Button className="w-full" type="submit" disabled={busy}>{busy ? "Verificando..." : "Entrar"}</Button>
  </form></main>;
}
