import { createServerFn } from "@tanstack/react-start";
import { readAll, appendRow, updateRow, removeRow, setServiceStatus } from "./sheets.server";
import type { TabName } from "./sheets-config";

export const getSheetData = createServerFn({ method: "GET" }).handler(async () => readAll());

export const addRow = createServerFn({ method: "POST" })
  .inputValidator((data: { tab: TabName; values: string[] }) => data)
  .handler(async ({ data }) => appendRow(data.tab, data.values));

export const updateRowData = createServerFn({ method: "POST" })
  .inputValidator((data: { tab: TabName; row: number; values: string[] }) => data)
  .handler(async ({ data }) => updateRow(data.tab, data.row, data.values));

export const deleteRow = createServerFn({ method: "POST" })
  .inputValidator((data: { tab: TabName; row: number }) => data)
  .handler(async ({ data }) => removeRow(data.tab, data.row));

export const updateStatus = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string; status: string }) => data)
  .handler(async ({ data }) => setServiceStatus(data.id, data.status));
