import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { appendCompany, endSession, listCompanies, readSession, setCompanyPassword, startSession, verifyPassword } from "./auth.server";
import { createCompanySpreadsheet } from "./google.server";

const norm = (s: string | undefined) => (s ?? "").trim().toLowerCase();
const normName = (s: string | undefined) => norm(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ");

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
        password: z.string().trim().min(6).max(200),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const all = await listCompanies();
    if (all.some((r) => norm(r[3]) === data.email)) throw new Error("Já existe uma empresa com este e-mail.");
    const max = all.reduce((m, r) => Math.max(m, parseInt((r[0] || "").replace(/\D/g, ""), 10) || 0), 0);
    const cid = `EMP-${String(max + 1).padStart(3, "0")}`;
    const sid = await createCompanySpreadsheet(data.company, data.email);
    // Password is stored visibly on purpose (owner's request) so it can be read and edited in the sheet.
    await appendCompany([cid, data.company, data.owner, data.email, data.password, sid, new Date().toISOString()]);
    await startSession({ cid, name: data.company, sid });
    return { ok: true };
  });

export const login = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ email: z.string().trim().toLowerCase().max(200), password: z.string().max(200) }).parse(d))
  .handler(async ({ data }) => {
    const all = await listCompanies();
    const idx = all.findIndex((r) => norm(r[3]) === data.email);
    const row = all[idx];
    if (!row || !row[5] || !(await verifyPassword(data.password, row[4] ?? ""))) throw new Error("E-mail ou senha incorretos.");
    // Old accounts still have an encrypted password: replace it with the visible one now that we know it.
    if ((row[4] ?? "").startsWith("pbkdf2$")) await setCompanyPassword(idx, data.password.trim()).catch((e) => console.error(e));
    await startSession({ cid: row[0]!, name: row[1]!, sid: row[5] });
    return { ok: true };
  });

export const resetPassword = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        email: z.string().trim().toLowerCase().max(200),
        company: z.string().trim().min(1).max(100),
        password: z.string().trim().min(6).max(200),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const all = await listCompanies();
    const idx = all.findIndex((r) => norm(r[3]) === data.email && normName(r[1]) === normName(data.company));
    if (idx < 0) throw new Error("Não encontramos uma empresa com este e-mail e nome.");
    await setCompanyPassword(idx, data.password);
    return { ok: true };
  });

export const logout = createServerFn({ method: "POST" }).handler(async () => {
  endSession();
  return { ok: true };
});
