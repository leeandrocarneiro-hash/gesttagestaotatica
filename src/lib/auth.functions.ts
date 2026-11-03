import { supabase } from "@/integrations/supabase/client";

export async function getSession() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  const { data: company, error: profileError } = await supabase.from("companies").select("company_name").eq("id", user.id).maybeSingle();
  if (profileError) throw new Error(profileError.message);
  return { empresa: company?.company_name ?? user.user_metadata?.company_name ?? "Minha empresa", login: user.email ?? "", papel: "company_admin" as const, spreadsheetId: null };
}
export async function doLogin(input: { data: { login: string; senha: string } }) {
  const { error } = await supabase.auth.signInWithPassword({ email: input.data.login.trim().toLowerCase(), password: input.data.senha });
  if (error) throw new Error("E-mail ou senha incorretos.");
  return { ok: true };
}
export async function doLogout() {
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error(error.message);
  return { ok: true };
}
export async function registerCompany(input: { data: { companyName: string; displayName: string; email: string; password: string } }) {
  const { companyName, displayName, email, password } = input.data;
  const { data, error } = await supabase.auth.signUp({
    email: email.trim().toLowerCase(),
    password,
    options: { data: { company_name: companyName.trim(), display_name: displayName.trim() } },
  });
  if (error) throw new Error(error.message);
  if (!data.session) throw new Error("Cadastro criado. Confirme seu e-mail para entrar no GESTTA.");
  return { ok: true };
}
