import { SPREADSHEET_ID, TAB_NAMES, type SheetData, type TabName } from "./sheets-config";

export const GATEWAY = "https://connector-gateway.lovable.dev/google_sheets/v4";

function headers() {
  const a = process.env["LOVABLE_API_KEY"];
  const b = process.env["GOOGLE_SHEETS_API_KEY"];
  if (!a || !b) throw new Error("Conexão com Google Sheets não configurada");
  return { Authorization: `Bearer ${a}`, "X-Connection-Api-Key": b, "Content-Type": "application/json" };
}

export async function call(url: string, init?: RequestInit) {
  const r = await fetch(url, { ...init, headers: headers() });
  if (!r.ok) {
    const t = await r.text();
    console.error(`Sheets ${r.status}: ${t}`);
    throw new Error(`Erro na planilha [${r.status}]: ${t}`);
  }
  return r.json();
}

export async function readAll(): Promise<SheetData> {
  const qs = TAB_NAMES.map((t) => `ranges=${t}!A2:H`).join("&");
  const j = await call(`${GATEWAY}/spreadsheets/${SPREADSHEET_ID}/values:batchGet?${qs}`);
  const out = {} as SheetData;
  TAB_NAMES.forEach((t, i) => {
    out[t] = ((j.valueRanges?.[i]?.values ?? []) as unknown[][]).map((r) => r.map((c) => String(c ?? "")));
  });
  return out;
}

export async function appendRow(tab: TabName, values: string[]) {
  let row: (string | number)[] = values.map((v) => {
    const n = Number(v);
    return v !== "" && /^-?\d+(\.\d+)?$/.test(v) && !Number.isNaN(n) ? n : v;
  });
  let id: string | undefined;
  if (tab === "Servicos") {
    const current = await readAll();
    const max = current.Servicos.reduce((m, r) => {
      const n = parseInt((r[0] || "").replace(/\D/g, ""), 10);
      return Number.isNaN(n) ? m : Math.max(m, n);
    }, 0);
    id = `S-${String(max + 1).padStart(3, "0")}`;
    row = [id, ...row];
  }
  if (tab === "Materiais") {
    const q = Number(row[4]) || 0;
    const u = Number(row[5]) || 0;
    row = [...row.slice(0, 6), Math.round(q * u * 100) / 100];
  }
  await call(
    `${GATEWAY}/spreadsheets/${SPREADSHEET_ID}/values/${tab}!A1:H1:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    { method: "POST", body: JSON.stringify({ values: [row] }) },
  );
  return { ok: true, id };
}

export async function setServiceStatus(id: string, status: string) {
  const all = await readAll();
  const idx = all.Servicos.findIndex((r) => r[0] === id);
  if (idx < 0) throw new Error("Serviço não encontrado");
  await call(`${GATEWAY}/spreadsheets/${SPREADSHEET_ID}/values/Servicos!F${idx + 2}?valueInputOption=USER_ENTERED`, {
    method: "PUT",
    body: JSON.stringify({ values: [[status]] }),
  });
  return { ok: true };
}

const num = (s?: string) => {
  if (!s) return 0;
  const n = Number(String(s).replace(/[^\d.,-]/g, "").replace(/,(?=\d{3})/g, ""));
  return Number.isNaN(n) ? 0 : n;
};

export function serviceProfits(d: SheetData) {
  return d.Servicos.filter((r) => r[0]).map((r) => {
    const id = r[0];
    const preco = num(r[6]);
    const materiais = d.Materiais.filter((m) => m[1] === id).reduce((a, m) => a + num(m[6]), 0);
    const despesas = d.Despesas.filter((m) => m[1] === id).reduce((a, m) => a + num(m[4]), 0);
    const recebido = d.Recebimentos.filter((m) => m[1] === id).reduce((a, m) => a + num(m[3]), 0);
    const custo = materiais + despesas;
    return { id, data: r[1] ?? "", cliente: r[2] ?? "", descricao: r[4] ?? "", status: r[5] ?? "", preco, materiais, despesas, custo, lucro: preco - custo, recebido };
  });
}
