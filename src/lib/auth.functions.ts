import { createServerFn } from "@tanstack/react-start";
import {
  adminCreateCompany,
  adminListCompanies,
  adminSetCompanyStatus,
  currentSession,
  login,
  logout,
  setupInitialAdministrator,
  setupStatus,
} from "./auth.server";

export const getSession = createServerFn({ method: "GET" }).handler(async () => currentSession());

export const getSetupStatus = createServerFn({ method: "GET" }).handler(async () => setupStatus());

export const doLogin = createServerFn({ method: "POST" })
  .inputValidator((data: { login: string; senha: string }) => data)
  .handler(async ({ data }) => login(data.login, data.senha));

export const doLogout = createServerFn({ method: "POST" }).handler(async () => logout());

export const registerCompany = createServerFn({ method: "POST" })
  .inputValidator((data: { companyName: string; displayName: string; email: string; password: string }) => data)
  .handler(async ({ data }) => setupInitialAdministrator(data));

export const getCompanies = createServerFn({ method: "GET" }).handler(async () => adminListCompanies());

export const createCompany = createServerFn({ method: "POST" })
  .inputValidator((data: {
    razaoSocial: string;
    nomeFantasia: string;
    cnpj: string;
    emailContato: string;
    telefone: string;
    nomeAdmin: string;
    emailAdmin: string;
    senhaAdmin: string;
  }) => data)
  .handler(async ({ data }) => adminCreateCompany(data));

export const changeCompanyStatus = createServerFn({ method: "POST" })
  .inputValidator((data: { companyId: string; status: "ATIVA" | "BLOQUEADA" }) => data)
  .handler(async ({ data }) => adminSetCompanyStatus(data));
