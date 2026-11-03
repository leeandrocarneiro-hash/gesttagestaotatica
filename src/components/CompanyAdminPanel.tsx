import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { changeCompanyStatus, createCompany, getCompanies } from "@/lib/auth.functions";

export function CompanyAdminPanel() {
  const queryClient = useQueryClient();
  const companies = useQuery({ queryKey: ["companies"], queryFn: () => getCompanies() });
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    razaoSocial: "", nomeFantasia: "", cnpj: "", emailContato: "", telefone: "",
    nomeAdmin: "", emailAdmin: "", senhaAdmin: "",
  });

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await createCompany({ data: form });
      toast.success("Empresa e administrador cadastrados na planilha compartilhada.");
      setForm({ razaoSocial: "", nomeFantasia: "", cnpj: "", emailContato: "", telefone: "", nomeAdmin: "", emailAdmin: "", senhaAdmin: "" });
      await queryClient.invalidateQueries({ queryKey: ["companies"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível cadastrar a empresa.");
    } finally {
      setBusy(false);
    }
  }

  async function toggle(companyId: string, active: boolean) {
    try {
      await changeCompanyStatus({ data: { companyId, status: active ? "BLOQUEADA" : "ATIVA" } });
      toast.success(active ? "Empresa bloqueada." : "Empresa reativada.");
      await queryClient.invalidateQueries({ queryKey: ["companies"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível alterar a empresa.");
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(300px,420px)_1fr]">
      <section className="rounded-xl border bg-card p-4">
        <h2 className="mb-1 text-lg font-semibold">Cadastrar empresa</h2>
        <p className="mb-4 text-sm text-muted-foreground">A nova empresa terá acesso isolado aos próprios lançamentos dentro desta mesma planilha Google.</p>
        <form onSubmit={submit} className="space-y-3">
          {([
            ["razaoSocial", "Razão social", "text"],
            ["nomeFantasia", "Nome fantasia", "text"],
            ["cnpj", "CNPJ", "text"],
            ["emailContato", "E-mail de contato", "email"],
            ["telefone", "Telefone", "tel"],
            ["nomeAdmin", "Nome do administrador", "text"],
            ["emailAdmin", "E-mail de acesso", "email"],
            ["senhaAdmin", "Senha inicial (mínimo 12 caracteres)", "password"],
          ] as const).map(([key, label, type]) => (
            <label className="block space-y-1 text-sm" key={key}>
              <span>{label}</span>
              <input
                className="field w-full"
                type={type}
                value={form[key]}
                onChange={(event) => setForm((old) => ({ ...old, [key]: event.target.value }))}
                minLength={key === "senhaAdmin" ? 12 : undefined}
                maxLength={key === "senhaAdmin" ? 200 : 160}
                required={key !== "cnpj" && key !== "telefone"}
                autoComplete={key === "senhaAdmin" ? "new-password" : "off"}
              />
            </label>
          ))}
          <Button className="w-full" type="submit" disabled={busy}>
            {busy ? "Cadastrando..." : "Criar empresa e acesso"}
          </Button>
        </form>
      </section>

      <section className="rounded-xl border bg-card p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Empresas cadastradas</h2>
          <Button variant="outline" size="sm" onClick={() => void companies.refetch()} disabled={companies.isFetching}>Atualizar</Button>
        </div>
        {companies.isLoading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Carregando empresas...</p>
        ) : companies.isError ? (
          <p className="py-6 text-center text-sm text-destructive">{companies.error instanceof Error ? companies.error.message : "Falha ao carregar empresas."}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th className="px-2 py-2 font-medium">Empresa</th>
                  <th className="px-2 py-2 font-medium">CNPJ</th>
                  <th className="px-2 py-2 font-medium">Situação</th>
                  <th className="px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {(companies.data ?? []).map((company) => {
                  const active = company.status.toUpperCase() === "ATIVA";
                  return (
                    <tr className="border-t" key={company.id}>
                      <td className="px-2 py-3">
                        <div className="font-medium">{company.nomeFantasia || company.razaoSocial}</div>
                        <div className="text-xs text-muted-foreground">{company.razaoSocial}</div>
                      </td>
                      <td className="px-2 py-3 whitespace-nowrap">{company.cnpj || "—"}</td>
                      <td className="px-2 py-3">{active ? "Ativa" : "Bloqueada"}</td>
                      <td className="px-2 py-3 text-right">
                        <Button size="sm" variant="outline" onClick={() => void toggle(company.id, active)}>
                          {active ? "Bloquear" : "Reativar"}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!companies.data?.length && <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma empresa cadastrada.</p>}
          </div>
        )}
      </section>
    </div>
  );
}
