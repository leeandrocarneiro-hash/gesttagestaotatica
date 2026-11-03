import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getMe, login, resetPassword, signup } from "@/lib/auth.functions";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Entrar — Gestão de Serviços" },
      { name: "description", content: "Entre ou crie a conta da sua empresa para controlar serviços, custos e lucro com sua própria planilha Google." },
      { property: "og:title", content: "Entrar — Gestão de Serviços" },
      { property: "og:description", content: "Cada empresa com sua conta e sua planilha Google." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  beforeLoad: async () => {
    if (await getMe()) throw redirect({ to: "/" });
  },
  component: LoginPage,
});

function LoginPage() {
  const [mode, setMode] = useState<"login" | "signup" | "reset">("login");
  const [f, setF] = useState({ company: "", owner: "", email: "", password: "" });
  const [busy, setBusy] = useState(false);
  const loginFn = useServerFn(login);
  const signupFn = useServerFn(signup);
  const resetFn = useServerFn(resetPassword);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((p) => ({ ...p, [k]: e.target.value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "reset") {
        await resetFn({ data: { email: f.email, company: f.company, password: f.password } });
        toast.success("Senha alterada! Entre com a nova senha.");
        setF((p) => ({ ...p, password: "" }));
        setMode("login");
        return;
      }
      if (mode === "login") await loginFn({ data: { email: f.email, password: f.password } });
      else await signupFn({ data: f });
      qc.clear();
      toast.success(mode === "login" ? "Bem-vindo!" : "Conta criada! Sua planilha já está pronta.");
      navigate({ to: "/" });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const intro = {
    login: "Entre com o e-mail da sua empresa.",
    signup: "Crie a conta da sua empresa. Uma planilha Google exclusiva será criada e compartilhada com o seu e-mail.",
    reset: "Informe o e-mail e o nome da empresa exatamente como foram cadastrados, e escolha uma nova senha.",
  }[mode];
  const busyLabel = { login: "Entrando...", signup: "Criando sua planilha...", reset: "Salvando..." }[mode];
  const label = { login: "Entrar", signup: "Criar conta", reset: "Salvar nova senha" }[mode];

  return (
    <div className="flex min-h-screen items-center justify-center bg-primary px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-lg">
        <h1 className="font-display text-2xl font-bold">{mode === "reset" ? "Redefinir senha" : "Gestão de Serviços"}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{intro}</p>
        {mode !== "reset" && (
          <div className="mt-5 grid grid-cols-2 gap-1 rounded-lg bg-secondary p-1">
            {(["login", "signup"] as const).map((m) => (
              <button key={m} type="button" onClick={() => setMode(m)}
                className={`rounded-md py-2 text-sm font-medium transition ${mode === m ? "bg-background shadow-sm" : "text-muted-foreground"}`}>
                {m === "login" ? "Entrar" : "Criar conta"}
              </button>
            ))}
          </div>
        )}
        <form onSubmit={submit} className="mt-5 space-y-3">
          {mode !== "login" && <Input label="Nome da empresa" value={f.company} onChange={set("company")} />}
          {mode === "signup" && <Input label="Responsável" value={f.owner} onChange={set("owner")} />}
          <Input label={mode === "signup" ? "E-mail (de preferência uma conta Google)" : "E-mail"} type="email" value={f.email} onChange={set("email")} />
          <Input label={mode === "reset" ? "Nova senha (mínimo 6 caracteres)" : "Senha (mínimo 6 caracteres)"} type="password" value={f.password} onChange={set("password")} minLength={mode === "login" ? undefined : 6} />
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? busyLabel : label}
          </Button>
        </form>
        <div className="mt-4 text-center text-sm">
          {mode === "login" && (
            <button type="button" onClick={() => setMode("reset")} className="text-muted-foreground underline underline-offset-4 hover:text-foreground">
              Esqueci minha senha
            </button>
          )}
          {mode === "reset" && (
            <button type="button" onClick={() => setMode("login")} className="text-muted-foreground underline underline-offset-4 hover:text-foreground">
              Voltar para entrar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Input({ label, ...p }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      <input className="field" required {...p} />
    </label>
  );
}
