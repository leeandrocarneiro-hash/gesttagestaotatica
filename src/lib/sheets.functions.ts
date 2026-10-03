import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { SPREADSHEET_ID, TAB_NAMES, type SheetData, type TabName } from "./sheets-config";

const GATEWAY = "https://connector-gateway.lovable.dev/google_sheets/v4";

function headers() {
  const a = process.env["LOVABLE_API_KEY"];
  const b = process.env["GOOGLE_SHEETS_API_KEY"];
  if (!a || !b) throw new Error("Conexão com Google Sheets não configurada");
  return { Authorization: `Bearer ${a}`, "X-Connection-Api-Key": b, "Content-Type": "application/json" };
}

async function call(url: string, init?: RequestInit) {
  const r = await fetch(url, { ...init, headers: headers() });
  if (!r.ok) {
    const t = await r.text();
    console.error(`Sheets ${r.status}: ${t}`);
    throw new Error(`Erro na planilha [${r.status}]: ${t}`);
  }
  return r.json();
}

async function readAll(): Promise<SheetData> {
  const qs = TAB_NAMES.map((t) => `ranges=${t}!A2:H`).join("&");
  const j = await call(`${GATEWAY}/spreadsheets/${SPREADSHEET_ID}/values:batchGet?${qs}`);
  const out = {} as SheetData;
  TAB_NAMES.forEach((t, i) => {
    out[t] = ((j.valueRanges?.[i]?.values ?? []) as unknown[][]).map((r) => r.map((c) => String(c ?? "")));
  });
  return out;
}

export const getSheetData = createServerFn({ method: "GET" }).handler(async () => readAll());

export const addRow = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        tab: z.enum(TAB_NAMES as [TabName, ...TabName[]]),
        values: z.array(z.string().max(2000)).max(10),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    let row: (string | number)[] = data.values.map((v) => {
      const n = Number(v);
      return v !== "" && /^-?\d+(\.\d+)?$/.test(v) && !Number.isNaN(n) ? n : v;
    });
    if (data.tab === "Servicos") {
      const current = await readAll();
      const max = current.Servicos.reduce((m, r) => {
        const n = parseInt((r[0] || "").replace(/\D/g, ""), 10);
        return Number.isNaN(n) ? m : Math.max(m, n);
      }, 0);
      row = [`S-${String(max + 1).padStart(3, "0")}`, ...row];
    }
    if (data.tab === "Materiais") {
      const q = Number(row[4]) || 0;
      const u = Number(row[5]) || 0;
      row = [...row.slice(0, 6), Math.round(q * u * 100) / 100];
    }
    await call(
      `${GATEWAY}/spreadsheets/${SPREADSHEET_ID}/values/${data.tab}!A1:H1:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
      { method: "POST", body: JSON.stringify({ values: [row] }) },
    );
    return { ok: true };
  });

export const updateStatus = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ id: z.string().max(20), status: z.string().max(40) }).parse(d))
  .handler(async ({ data }) => {
    const all = await readAll();
    const idx = all.Servicos.findIndex((r) => r[0] === data.id);
    if (idx < 0) throw new Error("Serviço não encontrado");
    const rowNum = idx + 2;
    await call(`${GATEWAY}/spreadsheets/${SPREADSHEET_ID}/values/Servicos!F${rowNum}?valueInputOption=USER_ENTERED`, {
      method: "PUT",
      body: JSON.stringify({ values: [[data.status]] }),
    });
    return { ok: true };
  });
