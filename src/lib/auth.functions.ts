import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { currentSession, login, logout } from "./auth.server";
import { registerCompanyAccount } from "./central-auth.server";

export const getSession = createServerFn({ method: "GET" }).handler(async () => currentSession());

export const doLogin = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ login: z.string().trim().min(1).max(100), senha: z.string().min(1).max(200) }).parse(d))
  .handler(async ({ data }) => login(data.login, data.senha));

export const doLogout = createServerFn({ method: "POST" }).handler(async () => {
  await logout();
  return { ok: true };
});

export const registerCompany = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ companyName: z.string().trim().min(2).max(120), displayName: z.string().trim().min(2).max(120), email: z.string().trim().email().max(200), password: z.string().min(12).max(200) }).parse(d))
  .handler(async ({ data }) => registerCompanyAccount(data));
