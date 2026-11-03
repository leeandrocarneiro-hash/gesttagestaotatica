import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { submitCompanyAccessRequest } from "@/lib/central-auth.functions";

export const Route = createFileRoute("/solicitar-acesso")({
  head: () => ({ meta: [{ title: "Solicitar acesso | GESTTA" }] }),
  component: RequestAccessPage,
});

const initial = { razaoSocial: "", nomeFantasia: "", cnpj: "", nome: "", usuario: "", senha: "", email: "", telefone: "" };
function RequestAccessPage() {
  const submitRequest = useServerFn(submitCompanyAccessRequest);
  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true);
    try {
      await submitRequest({ data: form });
      setSent(true);
      setForm(initial);
      toast.success("Solicitação enviada para análise.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível enviar a solicitação."); }
    finally { setBusy(false); }
  }
  if (sent) return <main className="flex min-h-screen items-center justify-center bg-background px-4"><section className="w-full max-w-md space-y-4 rounded-xl border bg-card p-6 text-center shadow-sm"><h1 className="text-2xl font-bold">Solicitação enviada!</h1><p className="text-sm text-muted-foreground">Seus dados foram registrados. O acesso só será liberado depois da autorização da equipe GESTTA.</p><Button className="w-full" onClick={() => setSent(false)}>Voltar</Button><Link className="block text-sm underline" to="/login">Ir para entrar</Link></section></main>;
  return <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10"><form onSubmit={submit} className="w-full max-w-2xl space-y-5 rounded-xl border bg-card p-6 shadow-sm"><header><p className="text-sm font-medium text-primary">GESTTA</p><h1 className="text-2xl font-bold">Solicitar acesso para minha empresa</h1><p className="text-sm text-muted-foreground">Preencha os dados. A conta será criada somente após a aprovação.</p></header><div className="grid gap-4 sm:grid-cols-2">
{([["razaoSocial","Razão social","text"],["nomeFantasia","Nome fantasia","text"],["cnpj","CNPJ","text"],["nome","Nome do responsável","text"],["usuario","Usuário desejado","text"],["senha","Senha desejada","password"],["email","E-mail de contato","email"],["telefone","Telefone","tel"]] as const).map(([key,label,type]) => <label key={key} className="block space-y-1 text-sm"><span>{label}</span><input className="field w-full" type={type} value={form[key]} onChange={(e) => setForm((v) => ({ ...v, [key]: e.target.value }))} minLength={key === "usuario" ? 3 : key === "senha" ? 8 : undefined} maxLength={200} autoComplete="off" required={key !== "cnpj" && key !== "telefone"} /></label>)}</div><p className="text-xs text-muted-foreground">O usuário deve ter pelo menos 3 caracteres. A senha deve ter pelo menos 8 caracteres. A solicitação não libera acesso automaticamente.</p><Button className="w-full" type="submit" disabled={busy}>{busy ? "Enviando..." : "Enviar solicitação de acesso"}</Button><Link className="block text-center text-sm underline" to="/login">Já tenho acesso</Link></form></main>;
}
