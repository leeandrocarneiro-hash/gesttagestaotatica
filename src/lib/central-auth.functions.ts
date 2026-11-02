import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { centralLogin, centralLogout, currentCentralUser, createCompanyAndAdmin, listCompanies, setCompanyStatus } from "./central-auth.server";

export const centralGetSession = createServerFn({ method: "GET" }).handler(async () => {
  const user = await currentCentralUser();
  if (!user) return null;
  return { id: user.id, nome: user.nome, email: user.email, papel: user.papel, empresaId: user.empresaId };
});

export const centralDoLogin = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ email: z.string().trim().email().max(200), senha: z.string().min(1).max(200) }).parse(d))
  .handler(async ({ data }) => centralLogin(data.email, data.senha));

export const centralAdminDoLogin = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ email: z.string().trim().email().max(200), senha: z.string().min(1).max(200) }).parse(d))
  .handler(async ({ data }) => centralLogin(data.email, data.senha, "general_admin"));

export const centralDoLogout = createServerFn({ method: "POST" }).handler(async () => {
  await centralLogout();
  return { ok: true };
});

export const adminListCompanies = createServerFn({ method: "GET" }).handler(async () => listCompanies());

export const adminCreateCompany = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({
    razaoSocial: z.string().trim().min(2).max(180),
    nomeFantasia: z.string().trim().min(2).max(120),
    cnpj: z.string().trim().max(18),
    emailContato: z.string().trim().email().max(200),
    telefone: z.string().trim().max(30),
    nomeAdmin: z.string().trim().min(2).max(120),
    emailAdmin: z.string().trim().email().max(200),
    senhaAdmin: z.string().min(12).max(200),
  }).parse(d))
  .handler(async ({ data }) => createCompanyAndAdmin(data));

export const adminSetCompanyStatus = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ companyId: z.string().uuid(), status: z.enum(["ATIVA", "BLOQUEADA"]) }).parse(d))
  .handler(async ({ data }) => setCompanyStatus(data.companyId, data.status));

export const saveCentralCompanySheet = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ link: z.string().trim().min(10).max(500) }).parse(d))
  .handler(async ({ data }) => {
    const { saveCurrentCompanySheet } = await import("./central-auth.server");
    return saveCurrentCompanySheet(data.link);
  });
