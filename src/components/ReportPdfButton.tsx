import { useState } from "react";
import { FileDown } from "lucide-react";
import type { SheetData } from "@/lib/sheets-config";
import { Button } from "@/components/ui/button";

const money = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const amount = (s?: string) => {
  if (!s) return 0;
  const raw = String(s).trim().replace(/R\$\s?/g, "").replace(/\.(?=\d{3}(?:\D|$))/g, "").replace(",", ".");
  const n = Number(raw.replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};
const dateKey = (s?: string) => {
  if (!s) return "";
  const v = String(s).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  const br = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  return "";
};
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const sum = (rows: string[][], idx: number) => rows.reduce((a, r) => a + amount(r[idx]), 0);
const pct = (now: number, before: number) => before === 0 ? (now === 0 ? "0%" : "Sem base anterior") : `${((now - before) / Math.abs(before) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

function buildReport(data: SheetData, start: string, end: string) {
  const inPeriod = (row: string[], idx: number) => { const d = dateKey(row[idx]); return !!d && d >= start && d <= end; };
  const services = data.Servicos.filter((r) => inPeriod(r, 1) && r[5] !== "Cancelado");
  const completed = services.filter((r) => r[5] === "Concluído");
  const materials = data.Materiais.filter((r) => inPeriod(r, 0));
  const expenses = data.Despesas.filter((r) => inPeriod(r, 0));
  const receipts = data.Recebimentos.filter((r) => inPeriod(r, 0));
  const revenue = sum(services, 6);
  const materialCosts = sum(materials, 6);
  const expenseCosts = sum(expenses, 4);
  const costs = materialCosts + expenseCosts;
  const profit = revenue - costs;
  const received = sum(receipts, 3);
  const serviceRows = completed.map((s) => {
    const id = s[0];
    const mat = data.Materiais.filter((r) => r[1] === id && inPeriod(r, 0)).reduce((a, r) => a + amount(r[6]), 0);
    const exp = data.Despesas.filter((r) => r[1] === id && inPeriod(r, 0)).reduce((a, r) => a + amount(r[4]), 0);
    const cost = mat + exp;
    const price = amount(s[6]);
    return { id, date: s[1], client: s[2], description: s[4], price, cost, profit: price - cost, margin: price ? ((price - cost) / price) * 100 : null };
  });
  const endDate = new Date(`${end}T12:00:00`);
  const prevEnd = new Date(endDate); prevEnd.setDate(0);
  const prevStart = new Date(prevEnd); prevStart.setDate(1);
  const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  const pStart = fmt(prevStart), pEnd = fmt(prevEnd);
  const prevFilter = (r: string[], i: number) => { const d = dateKey(r[i]); return !!d && d >= pStart && d <= pEnd; };
  const prevServices = data.Servicos.filter((r) => prevFilter(r,1) && r[5] !== "Cancelado");
  const prevRevenue = sum(prevServices,6);
  const prevCosts = sum(data.Materiais.filter((r) => prevFilter(r,0)),6) + sum(data.Despesas.filter((r) => prevFilter(r,0)),4);
  const prevProfit = prevRevenue - prevCosts;
  const expenseTrend = sum(expenses,4);
  const overdue = data.Despesas.filter((r) => { const d=dateKey(r[0]); return !!d && d < fmt(new Date()) && d >= start && amount(r[4]) > 0; });
  const lowMargin = serviceRows.filter((r) => r.margin !== null && r.margin < 20);
  const materialsByName = new Map<string, number>();
  materials.forEach((r) => materialsByName.set(r[2] || "Material sem nome", (materialsByName.get(r[2] || "Material sem nome") || 0) + amount(r[4])));
  const topMaterials = [...materialsByName.entries()].sort((a,b)=>b[1]-a[1]).slice(0,5);
  const warnings: string[] = [];
  if (!services.length) warnings.push("Não há serviços cadastrados no período selecionado; faturamento não pode ser estimado a partir de outros registros.");
  if (!receipts.length) warnings.push("Não há recebimentos registrados no período. Isso não significa necessariamente ausência de recebimentos fora do sistema.");
  if (lowMargin.length) warnings.push(`${lowMargin.length} serviço(s) concluído(s) têm margem inferior a 20% ou prejuízo. Revise preço, materiais e despesas vinculadas.`);
  if (overdue.length) warnings.push(`${overdue.length} despesa(s) têm data anterior a hoje e podem estar atrasadas; a planilha não possui campo de status de pagamento, então confirme antes de considerar atraso.`);
  if (expenseTrend > prevCosts && prevCosts > 0) warnings.push(`Os custos registrados aumentaram ${pct(costs, prevCosts)} em relação ao mês anterior. Confira compras e despesas extraordinárias.`);
  if (!data.Materiais.length) warnings.push("Não há lançamentos de materiais suficientes para estimar estoque, níveis mínimos ou reposição.");
  if (!data.Despesas.length) warnings.push("Não há despesas cadastradas; os custos e o lucro podem estar incompletos.");
  const kpi = (label: string, value: string, sub = "") => `<div class="kpi"><div class="klabel">${esc(label)}</div><div class="kvalue">${esc(value)}</div><div class="ksub">${esc(sub)}</div></div>`;
  const table = (headers: string[], rows: string[][], empty: string) => rows.length ? `<table><thead><tr>${headers.map(h=>`<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map(c=>`<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table>` : `<p class="empty">${esc(empty)}</p>`;
  const bars = [
    ["Faturamento", revenue, "#1d5fa7"],
    ["Custos totais", costs, "#d97706"],
    ["Lucro / prejuízo", profit, profit >= 0 ? "#16845b" : "#c0392b"],
  ];
  const max = Math.max(1, ...bars.map(b=>Math.abs(b[1] as number)));
  const chart = `<div class="bars">${bars.map(([label,val,color])=>`<div class="barrow"><span>${esc(label)}</span><div class="track"><div class="fill" style="width:${Math.max(1,Math.abs(val as number)/max*100)}%;background:${color}"></div></div><b>${money(val as number)}</b></div>`).join("")}</div>`;
  const serviceTable = table(["Serviço","Data","Cliente","Valor cobrado","Custos vinculados","Lucro","Margem"], serviceRows.map(r=>[esc(r.id),esc(r.date),esc(r.client),money(r.price),money(r.cost),money(r.profit),r.margin===null?"Sem base":`${r.margin.toLocaleString("pt-BR",{maximumFractionDigits:1})}%`]), "Nenhum serviço concluído com dados no período.");
  const monthly = table(["Indicador","Período selecionado","Mês anterior","Variação"], [
    ["Faturamento",money(revenue),money(prevRevenue),pct(revenue,prevRevenue)],
    ["Despesas e materiais",money(costs),money(prevCosts),pct(costs,prevCosts)],
    ["Lucro estimado",money(profit),money(prevProfit),pct(profit,prevProfit)]
  ], "Não há dados suficientes para comparação.");
  const recTable = table(["Data","Serviço","Cliente","Valor recebido"], receipts.map(r=>[esc(r[0]),esc(r[1]),esc(r[2]),money(amount(r[3]))]),"Nenhum recebimento registrado no período.");
  const expenseTable = table(["Data","Categoria","Descrição","Valor"], expenses.map(r=>[esc(r[0]),esc(r[2]),esc(r[3]),money(amount(r[4]))]),"Nenhuma despesa registrada no período.");
  const materialTable = table(["Data","Material","Quantidade","Custo total"], materials.map(r=>[esc(r[0]),esc(r[2]),esc(r[4]),money(amount(r[6]))]),"Nenhuma compra/material registrado no período.");
  const alertHtml = warnings.length ? `<ul class="alerts">${warnings.map(w=>`<li>${esc(w)}</li>`).join("")}</ul>` : "<p>Não foram identificados alertas automáticos com os dados disponíveis.</p>";
  const days30 = new Date(); days30.setDate(days30.getDate()+30);
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Relatório financeiro GESTTA</title><style>
  @page{size:A4;margin:14mm}*{box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;color:#1f2937;font-size:10pt;margin:0;line-height:1.4}.hero{background:#123f78;color:white;padding:22px 24px;border-radius:8px}.brand{font-size:24pt;font-weight:800;letter-spacing:2px}.hero p{margin:4px 0 0;color:#e0ecfb}.period{font-size:11pt;margin-top:12px}.section{margin-top:22px;break-inside:avoid}.section h2{font-size:14pt;color:#174e8c;border-bottom:2px solid #d8e5f4;padding-bottom:6px}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:9px;margin-top:12px}.kpi{border:1px solid #d9e2ee;border-radius:7px;padding:12px}.klabel{font-size:8pt;color:#5b6472;text-transform:uppercase}.kvalue{font-size:15pt;font-weight:bold;margin-top:6px;color:#174e8c}.ksub{font-size:8pt;color:#667085;margin-top:4px}table{width:100%;border-collapse:collapse;font-size:8.5pt;margin-top:10px}th{background:#eaf1f9;text-align:left;color:#173f70}th,td{padding:7px;border:1px solid #d8dee8;vertical-align:top}tr{break-inside:avoid}.empty{background:#f7f9fc;padding:12px;color:#667085;border-radius:5px}.bars{margin-top:12px}.barrow{display:grid;grid-template-columns:120px 1fr 110px;gap:10px;align-items:center;margin:10px 0}.track{height:12px;background:#eef2f7;border-radius:8px;overflow:hidden}.fill{height:100%;border-radius:8px}.alerts li{margin:7px 0}.note{font-size:8pt;color:#667085}.footer{margin-top:24px;border-top:1px solid #d8dee8;padding-top:8px;font-size:8pt;color:#667085}@media print{.section{break-inside:auto}.hero,th,.kpi{print-color-adjust:exact;-webkit-print-color-adjust:exact}}
  </style></head><body><div class="hero"><div class="brand">GESTTA</div><div>Relatório financeiro e operacional</div><div class="period">Período: ${esc(start)} a ${esc(end)}</div><p>Gerado em ${new Date().toLocaleString("pt-BR")}</p></div>
  <section class="section"><h2>1. Resumo financeiro</h2><div class="grid">${kpi("Faturamento registrado",money(revenue),"Serviços não cancelados com data no período")}${kpi("Custos totais",money(costs),`Materiais ${money(materialCosts)} + despesas ${money(expenseCosts)}`)}${kpi(profit>=0?"Lucro estimado":"Prejuízo estimado",money(profit),"Faturamento menos custos registrados")}${kpi("Valores recebidos",money(received),"Somente recebimentos lançados no período")}${kpi("Despesas registradas",money(expenseCosts),"Não há status para distinguir pago de a pagar")}${kpi("Serviços concluídos",String(completed.length),"Base para rentabilidade por serviço")}</div>${chart}<p class="note">Faturamento é o valor cobrado dos serviços; recebimentos são lançamentos de entrada de dinheiro. Lucro estimado = faturamento menos materiais e despesas cadastrados. Não equivale ao saldo bancário/caixa. Materiais são considerados uma única vez no custo total.</p></section>
  <section class="section"><h2>2. Comparação mensal</h2><p>Comparação do mês que contém a data final selecionada com o mês imediatamente anterior (${esc(pStart)} a ${esc(pEnd)} como mês anterior).</p>${monthly}</section>
  <section class="section"><h2>3. Rentabilidade dos serviços concluídos</h2>${serviceTable}<p class="note">Custos vinculados consideram apenas materiais e despesas associados ao serviço e registrados no período selecionado. Serviços sem custo vinculado podem apresentar margem superestimada.</p></section>
  <section class="section"><h2>4. Fluxo de caixa e próximos 30 dias</h2><p>Valores recebidos no período: <b>${money(received)}</b>. Pagamentos previstos, contas a pagar/receber com vencimento e projeção de saldo para os próximos 30 dias: <b>indisponíveis</b>, pois os cadastros atuais não possuem vencimento, status de pagamento nem saldo inicial de caixa. Não é possível projetar sem inventar dados.</p><h3>Recebimentos registrados</h3>${recTable}<h3>Despesas registradas (não significa que foram pagas)</h3>${expenseTable}</section>
  <section class="section"><h2>5. Estoque e compras</h2><p>Valor estimado do estoque, quantidades mínimas, produtos abaixo do mínimo e reposição: <b>não disponíveis</b>, pois o sistema registra materiais comprados/consumidos, mas não mantém saldo em estoque nem nível mínimo.</p><h3>Materiais registrados no período</h3>${materialTable}<h3>Materiais mais lançados por quantidade</h3>${topMaterials.length?table(["Material","Quantidade total"],topMaterials.map(([n,q])=>[esc(n),String(q)]),"Sem materiais."):"<p class='empty'>Não há dados de materiais.</p>"}</section>
  <section class="section"><h2>6. Diagnóstico e recomendações</h2>${alertHtml}<ul><li>Cadastre todos os custos e despesas e vincule-os aos serviços correspondentes para melhorar a precisão das margens.</li><li>Registre separadamente vencimento e situação (pago/pendente) das contas para calcular atrasos e fluxo de caixa.</li><li>Para controle de estoque, cadastre saldo atual, unidade de medida e estoque mínimo de cada material.</li></ul></section>
  <div class="footer">Relatório gerado exclusivamente a partir dos dados cadastrados no sistema. Campos ausentes são sinalizados como indisponíveis; valores não foram estimados sem base.</div><script>window.addEventListener('load',()=>setTimeout(()=>window.print(),350));</script></body></html>`;
}

export function ReportPdfButton({ data }: { data: SheetData }) {
  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const toInput = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  const [start, setStart] = useState(toInput(monthStart));
  const [end, setEnd] = useState(toInput(today));
  const [open, setOpen] = useState(false);
  const generate = () => {
    if (!start || !end || start > end) return;
    const w = window.open("", "_blank");
    if (!w) { alert("Permita pop-ups para gerar o relatório PDF."); return; }
    w.document.open();
    w.document.write(buildReport(data, start, end));
    w.document.close();
    setOpen(false);
  };
  return <div className="relative">
    <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(!open)}><FileDown className="mr-1 h-4 w-4" /> Relatório PDF</Button>
    {open && <div className="absolute right-0 top-full z-50 mt-2 w-72 rounded-lg border bg-background p-4 text-foreground shadow-xl">
      <h3 className="font-semibold">Gerar relatório</h3>
      <p className="mt-1 text-xs text-muted-foreground">Escolha o período. Na janela de impressão, selecione “Salvar como PDF”.</p>
      <label className="mt-3 block text-sm">Data inicial<input className="field mt-1" type="date" value={start} max={end} onChange={e=>setStart(e.target.value)} /></label>
      <label className="mt-3 block text-sm">Data final<input className="field mt-1" type="date" value={end} min={start} onChange={e=>setEnd(e.target.value)} /></label>
      <div className="mt-4 flex justify-end gap-2"><Button variant="outline" size="sm" onClick={()=>setOpen(false)}>Cancelar</Button><Button size="sm" disabled={!start||!end||start>end} onClick={generate}>Gerar PDF</Button></div>
    </div>}
  </div>;
}
