import {
  centralLogin,
  centralLogout,
  currentCentralUser,
  currentCompanyLabel,
  hasInitialSetup,
  registerInitialAdministrator,
  createCompanyAndAdmin,
  listCompanies,
  setCompanyStatus,
} from "./central-auth.server";

export type Session = {
  id: string;
  empresa: string;
  login: string;
  papel: "general_admin" | "company_admin" | "employee";
};

export async function login(loginName: string, senha: string) {
  return centralLogin(loginName, senha);
}

export async function logout() {
  await centralLogout();
  return { ok: true };
}

export async function currentSession(): Promise<Session | null> {
  const user = await currentCentralUser();
  if (!user) return null;
  return {
    id: user.id,
    empresa: await currentCompanyLabel(),
    login: user.email,
    papel: user.papel,
  };
}

export async function setupStatus() {
  return { required: await hasInitialSetup() };
}

export async function setupInitialAdministrator(input: {
  companyName: string;
  displayName: string;
  email: string;
  password: string;
}) {
  return registerInitialAdministrator(input);
}

export async function adminListCompanies() {
  return listCompanies();
}

export async function adminCreateCompany(input: {
  razaoSocial: string;
  nomeFantasia: string;
  cnpj: string;
  emailContato: string;
  telefone: string;
  nomeAdmin: string;
  emailAdmin: string;
  senhaAdmin: string;
}) {
  return createCompanyAndAdmin(input);
}

export async function adminSetCompanyStatus(input: { companyId: string; status: "ATIVA" | "BLOQUEADA" }) {
  return setCompanyStatus(input.companyId, input.status);
}
