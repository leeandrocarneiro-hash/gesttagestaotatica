import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getMe, login, signup } from "@/lib/auth.functions";

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
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [f, setF] = useState({ company: "", owner: "", email: "", password: "" });
  const [busy, setBusy] = useState(false);
  const loginFn = useServerFn(login);
  const signupFn = useServerFn(signup);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((p) => ({ ...p, [k]: e.target.value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
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

  return (
    <div className="flex min-h-screen items-center justify-center bg-primary px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-lg">
        <h1 className="font-display text-2xl font-bold">Gestão de Serviços</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {mode === "login" ? "Entre com o e-mail da sua empresa." : "Crie a conta da sua empresa. Uma planilha Google exclusiva será criada e compartilhada com o seu e-mail."}
        </p>
        <div className="mt-5 grid grid-cols-2 gap-1 rounded-lg bg-secondary p-1">
          {(["login", "signup"] as const).map((m) => (
            <button key={m} type="button" onClick={() => setMode(m)}
              className={`rounded-md py-2 text-sm font-medium transition ${mode === m ? "bg-background shadow-sm" : "text-muted-foreground"}`}>
              {m === "login" ? "Entrar" : "Criar conta"}
            </button>
          ))}
        </div>
        <form onSubmit={submit} className="mt-5 space-y-3">
          {mode === "signup" && (
            <>
              <Input label="Nome da empresa" value={f.company} onChange={set("company")} />
              <Input label="Responsável" value={f.owner} onChange={set("owner")} />
            </>
          )}
          <Input label="E-mail (de preferência uma conta Google)" type="email" value={f.email} onChange={set("email")} />
          <Input label="Senha (mínimo 6 caracteres)" type="password" value={f.password} onChange={set("password")} minLength={6} />
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? (mode === "signup" ? "Criando sua planilha..." : "Entrando...") : mode === "login" ? "Entrar" : "Criar conta"}
          </Button>
        </form>
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
