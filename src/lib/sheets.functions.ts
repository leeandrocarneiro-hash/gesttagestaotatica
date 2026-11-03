import { supabase } from "@/integrations/supabase/client";
import { TAB_NAMES, type SheetData, type TabName } from "./sheets-config";

type Row = Record<string, any>;
const tables: Record<TabName, string> = {
  Servicos: "services", Atendimentos: "attendances", Materiais: "materials",
  Recebimentos: "receipts", Despesas: "expenses",
};
const columns: Record<TabName, string[]> = {
  Servicos: ["service_code","scheduled_date","client","phone","description","status","price","notes","id"],
  Atendimentos: ["attendance_date","client","contact","channel","subject","notes","id"],
  Materiais: ["material_date","service_code","material","supplier","quantity","unit_cost","total_cost","id"],
  Recebimentos: ["receipt_date","service_code","client","amount","payment_method","id"],
  Despesas: ["expense_date","service_code","category","description","amount","id"],
};
const numberAt = (v: string | undefined) => v ? Number(v.replace(",", ".")) || 0 : 0;
const dateOrNull = (v: string | undefined) => v || null;
async function companyId() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error("Sua sessão expirou. Entre novamente.");
  return user.id;
}
function toLegacy(tab: TabName, row: Row): string[] {
  const value = (key: string) => row[key] == null ? "" : String(row[key]);
  return columns[tab].map(value);
}
export async function getSheetData(): Promise<SheetData> {
  const out = {} as SheetData;
  for (const tab of TAB_NAMES) {
    const { data, error } = await supabase.from(tables[tab] as any).select("*").order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    out[tab] = ((data ?? []) as Row[]).map(row => toLegacy(tab, row));
  }
  return out;
}
export async function addRow(input: { data: { tab: TabName; values: string[] } }) {
  const { tab, values } = input.data;
  const company_id = await companyId();
  const v = (i: number) => values[i] ?? "";
  let row: Row;
  switch (tab) {
    case "Servicos": {
      const { data: existing, error } = await supabase.from("services").select("service_code").order("created_at", { ascending: false }).limit(1);
      if (error) throw new Error(error.message);
      const next = (existing ?? []).reduce((max: number, r: any) => Math.max(max, Number(String(r.service_code).replace(/\D/g,"")) || 0), 0) + 1;
      row = { company_id, service_code: `S-${String(next).padStart(3,"0")}`, scheduled_date: dateOrNull(v(0)), client: v(1), phone: v(2), description: v(3), status: v(4) || "Agendado", price: numberAt(v(5)), notes: v(6) }; break;
    }
    case "Atendimentos": row = { company_id, attendance_date: dateOrNull(v(0)), client: v(1), contact: v(2), channel: v(3), subject: v(4), notes: v(5) }; break;
    case "Materiais": row = { company_id, material_date: dateOrNull(v(0)), service_code: v(1) || null, material: v(2), supplier: v(3), quantity: numberAt(v(4)), unit_cost: numberAt(v(5)) }; break;
    case "Recebimentos": row = { company_id, receipt_date: dateOrNull(v(0)), service_code: v(1), client: v(2), amount: numberAt(v(3)), payment_method: v(4) }; break;
    case "Despesas": row = { company_id, expense_date: dateOrNull(v(0)), service_code: v(1) || null, category: v(2), description: v(3), amount: numberAt(v(4)) }; break;
  }
  const { error } = await supabase.from(tables[tab] as any).insert(row);
  if (error) throw new Error(error.message);
  return { ok: true };
}
export async function updateRow(input: { data: { tab: TabName; row: number; values: string[] } }) {
  const { tab, row: rowNumber, values } = input.data;
  const data = await getSheetData();
  const id = data[tab][rowNumber - 2]?.[columns[tab].length - 1];
  if (!id) throw new Error("Registro não encontrado. Atualize a tela e tente novamente.");
  const v = (i: number) => values[i] ?? "";
  let patch: Row;
  switch (tab) {
    case "Servicos": patch = { scheduled_date: dateOrNull(v(0)), client:v(1), phone:v(2), description:v(3), status:v(4), price:numberAt(v(5)), notes:v(6) }; break;
    case "Atendimentos": patch = { attendance_date:dateOrNull(v(0)), client:v(1), contact:v(2), channel:v(3), subject:v(4), notes:v(5) }; break;
    case "Materiais": patch = { material_date:dateOrNull(v(0)), service_code:v(1)||null, material:v(2), supplier:v(3), quantity:numberAt(v(4)), unit_cost:numberAt(v(5)) }; break;
    case "Recebimentos": patch = { receipt_date:dateOrNull(v(0)), service_code:v(1), client:v(2), amount:numberAt(v(3)), payment_method:v(4) }; break;
    case "Despesas": patch = { expense_date:dateOrNull(v(0)), service_code:v(1)||null, category:v(2), description:v(3), amount:numberAt(v(4)) }; break;
  }
  const { error } = await supabase.from(tables[tab] as any).update(patch).eq("id", id);
  if (error) throw new Error(error.message);
  return { ok: true };
}
export async function deleteRow(input: { data: { tab: TabName; row: number } }) {
  const { tab, row: rowNumber } = input.data;
  const data = await getSheetData();
  const id = data[tab][rowNumber - 2]?.[columns[tab].length - 1];
  if (!id) throw new Error("Registro não encontrado. Atualize a tela e tente novamente.");
  const { error } = await supabase.from(tables[tab] as any).delete().eq("id", id);
  if (error) throw new Error(error.message);
  return { ok: true };
}
export async function updateStatus(input: { data: { id: string; status: string } }) {
  const { error } = await supabase.from("services").update({ status: input.data.status }).eq("service_code", input.data.id);
  if (error) throw new Error(error.message);
  return { ok: true };
}
