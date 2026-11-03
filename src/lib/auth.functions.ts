import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { currentSession, login, logout, registerCompany, saveCompanySheet } from "./auth.server";

export const getSession = createServerFn({ method: "GET" }).handler(async () => currentSession());

export const doLogin = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ login: z.string().trim().email().max(200), senha: z.string().min(1).max(200) }).parse(d))
  .handler(async ({ data }) => login(data.login, data.senha));

export const doRegisterCompany = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({
    companyName: z.string().trim().min(2).max(160),
    displayName: z.string().trim().min(2).max(120),
    email: z.string().trim().email().max(200),
    password: z.string().min(12).max(200),
  }).parse(d))
  .handler(async ({ data }) => registerCompany(data));

export const doLogout = createServerFn({ method: "POST" }).handler(async () => {
  await logout();
  return { ok: true };
});

export const setCompanySheet = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ link: z.string().trim().min(10).max(500) }).parse(d))
  .handler(async ({ data }) => saveCompanySheet(data.link));
