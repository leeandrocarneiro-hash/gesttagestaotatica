import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { TAB_NAMES, type TabName } from "./sheets-config";
import { GATEWAY, call, readAll, appendRow, setServiceStatus } from "./sheets.server";
import { getTenantSpreadsheetId } from "./tenant.server";

const authInput = z.object({ accessToken: z.string().min(20) });

export const getSheetData = createServerFn({ method: "GET" })
  .inputValidator((d) => authInput.parse(d))
  .handler(async ({ data }) => readAll(await getTenantSpreadsheetId(data.accessToken)));

export const addRow = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({
    accessToken: z.string().min(20),
    tab: z.enum(TAB_NAMES as [TabName, ...TabName[]]),
    values: z.array(z.string().max(2000)).max(10),
  }).parse(d))
  .handler(async ({ data }) => {
    const spreadsheetId = await getTenantSpreadsheetId(data.accessToken);
    return appendRow(spreadsheetId, data.tab, data.values);
  });

export const deleteRow = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({
    accessToken: z.string().min(20),
    tab: z.enum(TAB_NAMES as [TabName, ...TabName[]]),
    row: z.number().int().min(2).max(100000),
  }).parse(d))
  .handler(async ({ data }) => {
    const spreadsheetId = await getTenantSpreadsheetId(data.accessToken);
    const meta = await call(`${GATEWAY}/spreadsheets/${spreadsheetId}`);
    const sheet = meta.sheets?.find((s: { properties: { title: string; sheetId: number } }) => s.properties.title === data.tab);
    if (!sheet) throw new Error("Aba não encontrada");
    await call(`${GATEWAY}/spreadsheets/${spreadsheetId}:batchUpdate`, {
      method: "POST",
      body: JSON.stringify({ requests: [{ deleteDimension: { range: {
        sheetId: sheet.properties.sheetId, dimension: "ROWS",
        startIndex: data.row - 1, endIndex: data.row,
      } } }] }),
    });
    return { ok: true };
  });

export const updateStatus = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({
    accessToken: z.string().min(20), id: z.string().max(20), status: z.string().max(40),
  }).parse(d))
  .handler(async ({ data }) => {
    const spreadsheetId = await getTenantSpreadsheetId(data.accessToken);
    return setServiceStatus(spreadsheetId, data.id, data.status);
  });
