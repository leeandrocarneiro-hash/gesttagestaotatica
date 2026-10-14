import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Download, ExternalLink, RefreshCw, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getSheetData, addRow, updateStatus, deleteRow } from "@/lib/sheets.functions";
import { ReportPdfButton } from "@/components/ReportPdfButton";
import { InvoiceImportButton } from "@/components/InvoiceImportButton";
import { SHEET_URL, SHEET_XLSX_URL, STATUS, TABS, TAB_NAMES, type SheetData, type TabName, type Field } from "@/lib/sheets-config";

const dataQuery = queryOptions({ queryKey: ["sheet"], queryFn: () => getSheetData(), staleTime: 30_000 });

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Gestão de Serviços — Agenda, custos e lucro" },
      { name: "description", content: "Controle serviços agendados, atendimentos, materiais, recebimentos, despesas e lucro por serviço, ligado ao Google Planilhas." },
      { property: "og:title", content: "Gestão de Serviços — Agenda, custos e lucro" },
      { property: "og:description", content: "Lance tudo no site e baixe a planilha com gráficos para reuniões." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(dataQuery),
  component: Index,
  errorComponent: ({ error }) => (
    <div className="mx-auto max-w-lg p-8 text-center">
      <h1 className="text-xl font-semibold">Não foi possível ler a planilha</h1>
      <p className="mt-2 text-sm text-muted-foreground">{(error as Error).message}</p>
    </div>
  ),
});

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const num = (s?: string) => {
  if (!s) return 0;
  const n = Number(String(s).replace(/[^\d.,-]/g, "").replace(/,(?=\d{3})/g, ""));
  return Number.isNaN(n) ? 0 : n;
};

function useSummary(d: SheetData) {
  return useMemo(() => {
    const services = d.Servicos.filter((r) => r[0]).map((r) => {
      const id = r[0];
      const preco = num(r[6]);
      const mat = d.Materiais.filter((m) => m[1] === id).reduce((a, m) => a + num(m[6]), 0);
      const desp = d.Despesas.filter((m) => m[1] === id).reduce((a, m) => a + num(m[4]), 0);
      const rec = d.Recebimentos.filter((m) => m[1] === id).reduce((a, m) => a + num(m[3]), 0);
      const custo = mat + desp;
      const lucro = preco - custo;
      return { id, data: r[1], cliente: r[2], desc: r[4], status: r[5], preco, mat, desp, custo, lucro, margem: preco ? lucro / preco : 0, rec };
    });
    const faturado = services.filter((s) => s.status !== "Cancelado").reduce((a, s) => a + s.preco, 0);
    const recebido = d.Recebimentos.reduce((a, r) => a + num(r[3]), 0);
    const gastoMat = d.Materiais.reduce((a, r) => a + num(r[6]), 0);
    const gastoDesp = d.Despesas.reduce((a, r) => a + num(r[4]), 0);
    const porCategoria = Object.entries(
      d.Despesas.reduce<Record<string, number>>((acc, r) => ((acc[r[2] || "Outros"] = (acc[r[2] || "Outros"] || 0) + num(r[4])), acc), {}),
    ).map(([name, value]) => ({ name, value }));
    if (gastoMat) porCategoria.push({ name: "Materiais", value: gastoMat });
    return { services, faturado, recebido, gastos: gastoMat + gastoDesp, saldo: recebido - gastoMat - gastoDesp, porCategoria };
  }, [d]);
}

const COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "var(--muted-foreground)"];

function Index() {
  const { data } = useSuspenseQuery(dataQuery);
  const qc = useQueryClient();
  const s = useSummary(data);
  const [tab, setTab] = useState<TabName | "Resumo">("Resumo");
  const [refreshing, setRefreshing] = useState(false);

  const agendados = s.services.filter((x) => x.status === "Agendado" || x.status === "Em execução");

  return (
    <div className="min-h-screen">
      <header className="border-b bg-primary text-primary-foreground">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-5">
          <div className="flex items-center gap-3">
            <img src="/logo.svg" alt="GESTTA — Evolua sua sugestão, alcance seus objetivos" className="h-16 w-auto max-w-[220px] shrink-0 rounded-md bg-white p-1" />
            <div>
              <h1 className="text-2xl font-bold">Gestão de Serviços</h1>
              <p className="text-sm opacity-80">Tudo lançado aqui vai direto para sua planilha Google.</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={async () => {
                setRefreshing(true);
                await qc.invalidateQueries({ queryKey: ["sheet"] });
                setRefreshing(false);
              }}
            >
              <RefreshCw className={refreshing ? "animate-spin" : ""} /> Atualizar
            </Button>
            <Button variant="secondary" size="sm" asChild>
              <a href={SHEET_URL} target="_blank" rel="noreferrer"><ExternalLink /> Abrir planilha</a>
            </Button>
            <ReportPdfButton data={data} />
            <Button size="sm" className="bg-accent text-accent-foreground hover:bg-accent/90" asChild>
              <a href={SHEET_XLSX_URL} target="_blank" rel="noreferrer"><Download /> Baixar com gráficos</a>
            </Button>
          </div>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4">
          {(["Resumo", ...TAB_NAMES] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`whitespace-nowrap rounded-t-md px-4 py-2 text-sm font-medium transition ${tab === t ? "bg-background text-foreground" : "opacity-75 hover:opacity-100"}`}
            >
              {t === "Resumo" ? "Resumo" : TABS[t].title}
            </button>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        {tab === "Resumo" ? (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Kpi label="Faturado (serviços)" value={brl(s.faturado)} />
              <Kpi label="Recebido" value={brl(s.recebido)} />
              <Kpi label="Gastos totais" value={brl(s.gastos)} />
              <Kpi label="Saldo em caixa" value={brl(s.saldo)} tone={s.saldo >= 0 ? "good" : "bad"} />
            </div>

            <section className="grid gap-4 md:grid-cols-3">
              <Panel title="Preço x Custo x Lucro" className="md:col-span-2">
                {s.services.length ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={s.services}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="id" fontSize={12} />
                      <YAxis fontSize={12} />
                      <Tooltip formatter={(v: number) => brl(v)} />
                      <Legend />
                      <Bar dataKey="preco" name="Preço" fill="var(--chart-1)" radius={4} />
                      <Bar dataKey="custo" name="Custo" fill="var(--chart-2)" radius={4} />
                      <Bar dataKey="lucro" name="Lucro" fill="var(--chart-3)" radius={4} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : <Empty />}
              </Panel>
              <Panel title="Para onde vai o dinheiro">
                {s.porCategoria.length ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <PieChart>
                      <Pie data={s.porCategoria} dataKey="value" nameKey="name" innerRadius={50} outerRadius={90}>
                        {s.porCategoria.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v: number) => brl(v)} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                ) : <Empty />}
              </Panel>
            </section>

            <Panel title="Lucro por serviço">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-muted-foreground">
                    <tr>{["Serviço", "Cliente", "Status", "Preço", "Materiais", "Despesas", "Lucro", "Margem", "Recebido"].map((h) => <th key={h} className="px-2 py-2 font-medium">{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {s.services.map((x) => (
                      <tr key={x.id} className="border-t">
                        <td className="px-2 py-2 font-medium">{x.id}</td>
                        <td className="px-2 py-2">{x.cliente}</td>
                        <td className="px-2 py-2"><StatusSelect id={x.id ?? ""} value={x.status ?? ""} /></td>
                        <td className="px-2 py-2">{brl(x.preco)}</td>
                        <td className="px-2 py-2">{brl(x.mat)}</td>
                        <td className="px-2 py-2">{brl(x.desp)}</td>
                        <td className={`px-2 py-2 font-semibold ${x.lucro >= 0 ? "text-success" : "text-destructive"}`}>{brl(x.lucro)}</td>
                        <td className={`px-2 py-2 ${x.margem < 0.2 ? "text-destructive" : ""}`}>{(x.margem * 100).toFixed(1)}%</td>
                        <td className="px-2 py-2">{brl(x.rec)}{x.rec < x.preco && x.status !== "Cancelado" && <span className="ml-1 text-xs text-muted-foreground">(falta {brl(x.preco - x.rec)})</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!s.services.length && <Empty />}
                <p className="mt-3 text-xs text-muted-foreground">Margem abaixo de 20% aparece em vermelho: vale revisar o preço.</p>
              </div>
            </Panel>

            <Panel title="Próximos serviços">
              {agendados.length ? (
                <ul className="divide-y">
                  {agendados.map((x) => (
                    <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                      <span><b>{x.data}</b> · {x.cliente} — {x.desc}</span>
                      <span className="rounded-full bg-secondary px-2 py-0.5 text-xs">{x.status}</span>
                    </li>
                  ))}
                </ul>
              ) : <Empty text="Nenhum serviço agendado." />}
            </Panel>
          </div>
        ) : (
          <TabView key={tab} tab={tab} data={data} />
        )}
      </main>
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-1 font-display text-xl font-bold md:text-2xl ${tone === "good" ? "text-success" : tone === "bad" ? "text-destructive" : ""}`}>{value}</div>
    </div>
  );
}

function Panel({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border bg-card p-4 ${className}`}>
      <h2 className="mb-3 text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Empty({ text = "Ainda não há lançamentos." }: { text?: string }) {
  return <p className="py-6 text-center text-sm text-muted-foreground">{text}</p>;
}

function StatusSelect({ id, value }: { id: string; value: string }) {
  const qc = useQueryClient();
  const fn = useServerFn(updateStatus);
  const m = useMutation({
    mutationFn: (status: string) => fn({ data: { id, status } }),
    onSuccess: () => { toast.success("Status atualizado"); qc.invalidateQueries({ queryKey: ["sheet"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <select className="field py-1 text-xs" value={value} disabled={m.isPending} onChange={(e) => m.mutate(e.target.value)}>
      {STATUS.map((o) => <option key={o}>{o}</option>)}
    </select>
  );
}

function DeleteButton({ tab, row, label }: { tab: TabName; row: number; label: string }) {
  const qc = useQueryClient();
  const fn = useServerFn(deleteRow);
  const m = useMutation({
    mutationFn: () => fn({ data: { tab, row } }),
    onSuccess: () => { toast.success("Lançamento excluído"); qc.invalidateQueries({ queryKey: ["sheet"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <button
      type="button"
      title={`Excluir ${label}`}
      aria-label={`Excluir ${label}`}
      disabled={m.isPending}
      className="rounded-md p-1.5 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
      onClick={() => { if (window.confirm(`Excluir ${label}? Esta ação não pode ser desfeita.`)) m.mutate(); }}
    >
      <Trash2 className="h-4 w-4" />
    </button>
  );
}

function TabView({ tab, data }: { tab: TabName; data: SheetData }) {
  const cfg = TABS[tab];
  const qc = useQueryClient();
  const fn = useServerFn(addRow);
  const today = new Date().toISOString().slice(0, 10);
  const fields = cfg.fields as Field[];
  const initial = (): string[] => fields.map((f) => (f.type === "date" ? today : f.type === "select" && f.required ? (f.options?.[0] ?? "") : ""));
  const [values, setValues] = useState<string[]>(initial);
  const services = data.Servicos.filter((r) => r[0]);

  const m = useMutation({
    mutationFn: () => fn({ data: { tab, values: values.map((v, i) => (fields[i]?.type === "number" ? v.replace(",", ".") : v)) } }),
    onSuccess: () => { toast.success("Lançado na planilha!"); setValues(initial()); qc.invalidateQueries({ queryKey: ["sheet"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const headers = tab === "Servicos" ? ["ID", ...cfg.fields.map((f) => f.label)] : tab === "Materiais" ? [...cfg.fields.map((f) => f.label), "Total"] : cfg.fields.map((f) => f.label);
  const rows = [...data[tab]].reverse();

  const submit = (e: FormEvent) => { e.preventDefault(); m.mutate(); };

  return (
    <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
      <Panel title={`Novo lançamento — ${cfg.title}`}>
        {tab === "Materiais" && <div className="mb-4"><InvoiceImportButton /></div>}
        <p className="-mt-2 mb-4 text-sm text-muted-foreground">{cfg.hint}</p>
        <form onSubmit={submit} className="space-y-3">
          {fields.map((f, i) => {
            const set = (v: string) => setValues((p) => p.map((x, j) => (j === i ? v : x)));
            return (
              <label key={f.label} className="block">
                <span className="mb-1 block text-sm font-medium">{f.label}{f.required && " *"}</span>
                {f.type === "textarea" ? (
                  <textarea className="field" rows={2} required={f.required} value={values[i]} onChange={(e) => set(e.target.value)} />
                ) : f.type === "select" ? (
                  <select className="field" required={f.required} value={values[i]} onChange={(e) => set(e.target.value)}>
                    {!f.required && <option value="">—</option>}
                    {f.options!.map((o) => <option key={o}>{o}</option>)}
                  </select>
                ) : f.type === "servico" ? (
                  <select className="field" required={f.required} value={values[i]} onChange={(e) => set(e.target.value)}>
                    <option value="">{f.required ? "Escolha o serviço" : "Nenhum (despesa geral)"}</option>
                    {services.map((r) => <option key={r[0]} value={r[0]}>{r[0]} · {r[2]}</option>)}
                  </select>
                ) : (
                  <input
                    className="field"
                    type={f.type === "number" ? "text" : f.type}
                    inputMode={f.type === "number" ? "decimal" : undefined}
                    pattern={f.type === "number" ? "[0-9]+([.,][0-9]{1,2})?" : undefined}
                    placeholder={f.type === "number" ? "0,00" : undefined}
                    required={f.required}
                    value={values[i]}
                    onChange={(e) => set(e.target.value)}
                  />
                )}
              </label>
            );
          })}
          <Button type="submit" className="w-full" disabled={m.isPending}>
            <Plus /> {m.isPending ? "Salvando..." : "Lançar"}
          </Button>
        </form>
      </Panel>

      <Panel title={`Lançamentos (${rows.length})`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground">
              <tr>
                {headers.map((h) => <th key={h} className="whitespace-nowrap px-2 py-2 font-medium">{h}</th>)}
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-t">
                  {headers.map((_, j) => <td key={j} className="px-2 py-2">{r[j]}</td>)}
                  <td className="px-2 py-2 text-right">
                    <DeleteButton tab={tab} row={rows.length - i + 1} label={r[0] || r[1] || "este lançamento"} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && <Empty />}
        </div>
      </Panel>
    </div>
  );
}
