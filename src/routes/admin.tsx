import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { adminCreateCompany, adminListCompanies, adminSetCompanyStatus, adminListAccessRequests, adminApproveAccessRequest, centralDoLogout, centralGetSession } from "@/lib/central-auth.functions";

type AccessRequest = { id: string; razaoSocial: string; nomeFantasia: string; cnpj: string; nome: string; usuario: string; email: string; telefone: string; criadoEm: string };\ntype Company = { id: string; razaoSocial: string; nomeFantasia: string; cnpj: string; emailContato: string; telefone: string; status: string; spreadsheetLinked: boolean };
const empty = { razaoSocial: "", nomeFantasia: "", cnpj: "", emailContato: "", telefone: "", nomeAdmin: "", emailAdmin: "", senhaAdmin: "" };

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Painel administrativo | GESTTA" }] }),
  component: AdminPage,
});
function AdminPage() {
  const navigate = useNavigate();
  const getSession = useServerFn(centralGetSession);
  const list = useServerFn(adminListCompanies);
  const create = useServerFn(adminCreateCompany);
  const setStatus = useServerFn(adminSetCompanyStatus);\n  const listRequests = useServerFn(adminListAccessRequests);\n  const approveRequest = useServerFn(adminApproveAccessRequest);\n  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const logout = useServerFn(centralDoLogout);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [form, setForm] = useState(empty);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function refresh() {
    const session = await getSession();
    if (!session || session.papel !== "general_admin") { navigate({ to: "/acesso-administrador", replace: true }); return; }
    setCompanies(await list());
    setLoading(false);
  }
  useEffect(() => { void refresh().catch((error) => { toast.error(error instanceof Error ? error.message : "Falha ao carregar painel."); setLoading(false); }); }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true);
    try {
      await create({ data: form });
      setForm(empty);
      toast.success("Empresa e administrador cadastrados.");
      await refresh();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível cadastrar."); }
    finally { setSaving(false); }
  }
  async function approve(request: AccessRequest) {\n    try { await approveRequest({ data: { requestId: request.id } }); toast.success("Solicitação aprovada e acesso criado."); await refresh(); }\n    catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível aprovar."); }\n  }\n  async function toggle(company: Company) {
    try {
      await setStatus({ data: { companyId: company.id, status: company.status === "ATIVA" ? "BLOQUEADA" : "ATIVA" } });
      toast.success(company.status === "ATIVA" ? "Empresa bloqueada." : "Empresa reativada.");
      await refresh();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível alterar o status."); }
  }
  async function signOut() { await logout(); navigate({ to: "/acesso-administrador", replace: true }); }

  if (loading) return <main className="mx-auto max-w-5xl p-6">Carregando painel administrativo...</main>;
  return <main className="mx-auto max-w-5xl space-y-8 px-4 py-8">
    <header className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-medium text-primary">GESTTA</p><h1 className="text-3xl font-bold">Painel administrativo</h1><p className="text-sm text-muted-foreground">Cadastro e controle das empresas.</p></div><Button variant="outline" onClick={signOut}>Sair</Button></header>
    <section className="rounded-xl border bg-card p-5 shadow-sm"><h2 className="mb-1 text-xl font-semibold">Cadastrar empresa</h2><p className="mb-5 text-sm text-muted-foreground">O cadastro cria a empresa e seu primeiro usuário administrador. O usuário e a senha ficam registrados na aba Usuarios da planilha central.</p>
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        {([["razaoSocial","Razão social"],["nomeFantasia","Nome fantasia"],["cnpj","CNPJ"],["emailContato","E-mail de contato"],["telefone","Telefone"],["nomeAdmin","Nome do administrador"],["emailAdmin","E-mail de acesso"],["senhaAdmin","Senha inicial (mínimo 12 caracteres)"]] as const).map(([key,label]) => <label key={key} className="block space-y-1 text-sm">{label}<input className="field w-full" type={key.includes("email") ? "email" : key === "senhaAdmin" ? "password" : "text"} minLength={key === "senhaAdmin" ? 12 : undefined} maxLength={key === "senhaAdmin" ? 200 : 200} required={key !== "cnpj" && key !== "telefone"} value={form[key]} autoComplete={key === "senhaAdmin" ? "new-password" : "off"} onChange={(e) => setForm((current) => ({ ...current, [key]: e.target.value }))} /></label>)}
        <div className="sm:col-span-2"><Button type="submit" disabled={saving}>{saving ? "Cadastrando..." : "Cadastrar empresa e administrador"}</Button></div>
      </form>
    </section>
    <section className="space-y-3"><div><h2 className="text-xl font-semibold">Solicitações de acesso</h2><p className="text-sm text-muted-foreground">As solicitações enviadas pelo site aparecem aqui. Somente a aprovação cria e ativa a conta.</p></div>
      {requests.length === 0 ? <p className="rounded-lg border p-5 text-sm text-muted-foreground">Nenhuma solicitação pendente.</p> : <div className="space-y-3">{requests.map((request) => <article key={request.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-4"><div><h3 className="font-semibold">{request.nomeFantasia || request.razaoSocial}</h3><p className="text-sm text-muted-foreground">{request.razaoSocial} · {request.cnpj || "CNPJ não informado"}</p><p className="text-sm">{request.nome} · usuário: <strong>{request.usuario}</strong></p><p className="text-xs text-muted-foreground">{request.email} · {request.telefone}</p><p className="text-xs text-muted-foreground">Enviada em {new Date(request.criadoEm).toLocaleString("pt-BR")}</p></div><Button size="sm" onClick={() => void approve(request)}>Autorizar acesso</Button></article>)}</div>}
    </section>
    <section className="space-y-3"><div><h2 className="text-xl font-semibold">Empresas cadastradas</h2><p className="text-sm text-muted-foreground">O bloqueio impede novos acessos dos usuários daquela empresa.</p></div>
      {companies.length === 0 ? <p className="rounded-lg border p-5 text-sm text-muted-foreground">Nenhuma empresa cadastrada.</p> : <div className="space-y-3">{companies.map((company) => <article key={company.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-4"><div><h3 className="font-semibold">{company.nomeFantasia || company.razaoSocial}</h3><p className="text-sm text-muted-foreground">{company.razaoSocial} · {company.cnpj || "CNPJ não informado"}</p><p className="text-xs text-muted-foreground">{company.emailContato} · Planilha: {company.spreadsheetLinked ? "vinculada" : "pendente"}</p><p className="mt-1 text-xs font-medium">{company.status}</p></div><Button size="sm" variant="outline" onClick={() => void toggle(company)}>{company.status === "ATIVA" ? "Bloquear" : "Reativar"}</Button></article>)}</div>}
    </section>
  </main>;
}
