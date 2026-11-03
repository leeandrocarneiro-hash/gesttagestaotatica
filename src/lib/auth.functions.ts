import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { appendCompany, endSession, hashPassword, listCompanies, readSession, startSession, verifyPassword } from "./auth.server";
import { createCompanySpreadsheet } from "./google.server";

export const getMe = createServerFn({ method: "GET" }).handler(async () => {
  const s = await readSession();
  return s ? { name: s.name, spreadsheetId: s.sid } : null;
});

export const signup = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        company: z.string().trim().min(2).max(100),
        owner: z.string().trim().min(2).max(100),
        email: z.string().trim().toLowerCase().email().max(200),
        password: z.string().min(6).max(200),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const all = await listCompanies();
    if (all.some((r) => r[3]?.toLowerCase() === data.email)) throw new Error("Já existe uma empresa com este e-mail.");
    const max = all.reduce((m, r) => Math.max(m, parseInt((r[0] || "").replace(/\D/g, ""), 10) || 0), 0);
    const cid = `EMP-${String(max + 1).padStart(3, "0")}`;
    const hash = data.password;
    const sid = await createCompanySpreadsheet(data.company, data.email);
    await appendCompany([cid, data.company, data.owner, data.email, hash, sid, new Date().toISOString()]);
    await startSession({ cid, name: data.company, sid });
    return { ok: true };
  });

export const login = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ email: z.string().trim().toLowerCase().max(200), password: z.string().max(200) }).parse(d))
  .handler(async ({ data }) => {
    const all = await listCompanies();
    const row = all.find((r) => r[3]?.toLowerCase() === data.email);
    if (!row || !(await verifyPassword(data.password, row[4] ?? ""))) throw new Error("E-mail ou senha incorretos.");
    await startSession({ cid: row[0]!, name: row[1]!, sid: row[5]! });
    return { ok: true };
  });

export const logout = createServerFn({ method: "POST" }).handler(async () => {
  endSession();
  return { ok: true };
});
