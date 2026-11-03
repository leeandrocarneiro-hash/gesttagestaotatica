import { TAB_NAMES, type SheetData, type TabName } from "./sheets-config";
import { currentCentralUser, requireCurrentCompanySheet } from "./central-auth.server";

export const GATEWAY = "https://connector-gateway.lovable.dev/google_sheets/v4";

const SCHEMAS: Record<TabName, { visible: number; idColumn: number; companyColumn: number; endColumn: string }> = {
  Servicos: { visible: 8, idColumn: 8, companyColumn: 9, endColumn: "J" },
  Atendimentos: { visible: 6, idColumn: 6, companyColumn: 7, endColumn: "H" },
  Materiais: { visible: 7, idColumn: 7, companyColumn: 8, endColumn: "I" },
  Recebimentos: { visible: 5, idColumn: 5, companyColumn: 6, endColumn: "G" },
  Despesas: { visible: 5, idColumn: 5, companyColumn: 6, endColumn: "G" },
};

function authHeaders() {
  const apiKey = process.env["LOVABLE_API_KEY"];
  const connectionKey = process.env["GOOGLE_SHEETS_API_KEY"];
  if (!apiKey || !connectionKey) throw new Error("A conexão Google Sheets do GESTTA não está configurada.");
  return {
    Authorization: `Bearer ${apiKey}`,
    "X-Connection-Api-Key": connectionKey,
    "Content-Type": "application/json",
  };
}

async function call(spreadsheetId: string, path: string, init?: RequestInit): Promise<any> {
  const response = await fetch(`${GATEWAY}/spreadsheets/${spreadsheetId}${path}`, {
    ...init,
    headers: { ...authHeaders(), ...(init?.headers ?? {}) },
  });
  if (!response.ok) {
    const detail = await response.text();
    console.error("GESTTA Sheets error", response.status, detail);
    throw new Error("Não foi possível concluir a operação na planilha compartilhada.");
  }
  if (response.status === 204) return {};
  return response.json();
}

function columnName(index: number): string {
  let value = index + 1;
  let result = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    value = Math.floor((value - 1) / 26);
  }
  return result;
}

async function readRows(spreadsheetId: string, tab: TabName): Promise<string[][]> {
  const schema = SCHEMAS[tab];
  const result = await call(spreadsheetId, `/values/${tab}!A2:${schema.endColumn}`);
  return ((result.values ?? []) as unknown[][]).map((row) => row.map((value) => String(value ?? "")));
}

export async function readAll(): Promise<SheetData> {
  const { spreadsheetId, companyId } = await requireCurrentCompanySheet();
  const output = {} as SheetData;
  for (const tab of TAB_NAMES) {
    const schema = SCHEMAS[tab];
    const rows = await readRows(spreadsheetId, tab);
    output[tab] = rows
      .filter((row) => row[schema.companyColumn] === companyId && row.slice(0, schema.visible).some((value) => value !== ""))
      .map((row) => [
        ...row.slice(0, schema.visible),
        row[schema.idColumn] ?? "",
      ]);
  }
  return output;
}

function numberAt(value: string | undefined): number {
  if (!value) return 0;
  const normalized = value.replace(/\s/g, "").replace(/\.(?=\d{3}(?:\D|$))/g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeValues(tab: TabName, values: string[], serviceCode?: string): (string | number)[] {
  const value = (index: number) => values[index] ?? "";
  switch (tab) {
    case "Servicos":
      return [serviceCode ?? "", value(0), value(1), value(2), value(3), value(4) || "Agendado", numberAt(value(5)), value(6)];
    case "Atendimentos":
      return [value(0), value(1), value(2), value(3), value(4), value(5)];
    case "Materiais": {
      const quantity = numberAt(value(4));
      const unitCost = numberAt(value(5));
      return [value(0), value(1), value(2), value(3), quantity, unitCost, Math.round(quantity * unitCost * 100) / 100];
    }
    case "Recebimentos":
      return [value(0), value(1), value(2), numberAt(value(3)), value(4)];
    case "Despesas":
      return [value(0), value(1), value(2), value(3), numberAt(value(4))];
  }
}

export async function appendRow(tab: TabName, values: string[]) {
  const user = await currentCentralUser();
  const { spreadsheetId, companyId } = await requireCurrentCompanySheet();
  let serviceCode: string | undefined;
  if (tab === "Servicos") {
    const rows = await readRows(spreadsheetId, "Servicos");
    const max = rows.reduce((current, row) => {
      if (row[SCHEMAS.Servicos.companyColumn] !== companyId) return current;
      const number = Number(String(row[0] ?? "").replace(/\D/g, "")) || 0;
      return Math.max(current, number);
    }, 0);
    serviceCode = `S-${String(max + 1).padStart(3, "0")}`;
  }

  const base = normalizeValues(tab, values, serviceCode);
  const row = [...base, crypto.randomUUID(), companyId];
  const schema = SCHEMAS[tab];
  await call(
    spreadsheetId,
    `/values/${tab}!A1:${schema.endColumn}1:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    { method: "POST", body: JSON.stringify({ values: [row] }) },
  );
  void user;
  return { ok: true, id: serviceCode };
}

async function findOwnedRow(tab: TabName, rowNumber: number) {
  const data = await readAll();
  const schema = SCHEMAS[tab];
  const id = data[tab][rowNumber - 2]?.[schema.visible];
  if (!id) throw new Error("Registro não encontrado. Atualize a tela e tente novamente.");
  const { spreadsheetId, companyId } = await requireCurrentCompanySheet();
  const rows = await readRows(spreadsheetId, tab);
  const index = rows.findIndex((row) => row[schema.idColumn] === id && row[schema.companyColumn] === companyId);
  if (index < 0) throw new Error("Registro não encontrado ou sem permissão para alterá-lo.");
  return { spreadsheetId, sheetRow: index + 2, id, schema };
}

export async function updateRow(tab: TabName, rowNumber: number, values: string[]) {
  const { spreadsheetId, sheetRow, schema } = await findOwnedRow(tab, rowNumber);
  const base = normalizeValues(tab, values, undefined);
  const firstColumn = tab === "Servicos" ? "B" : "A";
  const lastVisibleIndex = schema.visible - (tab === "Servicos" ? 1 : 1);
  const lastColumn = columnName(lastVisibleIndex);
  await call(spreadsheetId, `/values/${tab}!${firstColumn}${sheetRow}:${lastColumn}${sheetRow}?valueInputOption=USER_ENTERED`, {
    method: "PUT",
    body: JSON.stringify({ values: [tab === "Servicos" ? base.slice(1) : base] }),
  });
  return { ok: true };
}

export async function removeRow(tab: TabName, rowNumber: number) {
  const { spreadsheetId, sheetRow } = await findOwnedRow(tab, rowNumber);
  const metadata = await call(spreadsheetId, "?fields=sheets.properties.sheetId,sheets.properties.title");
  const target = (metadata.sheets ?? []).find((sheet: any) => sheet.properties?.title === tab);
  if (!target) throw new Error("Aba não encontrada na planilha.");
  await call(spreadsheetId, ":batchUpdate", {
    method: "POST",
    body: JSON.stringify({
      requests: [{
        deleteDimension: {
          range: { sheetId: target.properties.sheetId, dimension: "ROWS", startIndex: sheetRow - 1, endIndex: sheetRow },
        },
      }],
    }),
  });
  return { ok: true };
}

export async function setServiceStatus(id: string, status: string) {
  const { spreadsheetId, companyId } = await requireCurrentCompanySheet();
  const rows = await readRows(spreadsheetId, "Servicos");
  const index = rows.findIndex((row) => row[0] === id && row[SCHEMAS.Servicos.companyColumn] === companyId);
  if (index < 0) throw new Error("Serviço não encontrado ou sem permissão para alterá-lo.");
  const sheetRow = index + 2;
  await call(spreadsheetId, `/values/Servicos!F${sheetRow}?valueInputOption=USER_ENTERED`, {
    method: "PUT",
    body: JSON.stringify({ values: [[status]] }),
  });
  return { ok: true };
}
