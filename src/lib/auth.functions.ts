import { supabase } from "@/integrations/supabase/client";

export async function getSession() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  const { data: company, error: profileError } = await supabase
    .from("companies")
    .select("company_name, is_active")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError) throw new Error(profileError.message);
  if (!company) return null;
  if (company.is_active === false) {
    await supabase.auth.signOut();
    throw new Error("O acesso desta empresa está desativado. Entre em contato com o administrador do GESTTA.");
  }
  return {
    id: user.id,
    empresa: company.company_name ?? user.user_metadata?.company_name ?? "Minha empresa",
    login: user.email ?? "",
    papel: "company_admin" as const,
  };
}

export async function doLogin(input: { data: { login: string; senha: string } }) {
  const { error } = await supabase.auth.signInWithPassword({
    email: input.data.login.trim().toLowerCase(),
    password: input.data.senha,
  });
  if (error) throw new Error("E-mail ou senha incorretos.");
  const session = await getSession();
  if (!session) {
    await supabase.auth.signOut();
    throw new Error("Não foi possível localizar o cadastro da empresa.");
  }
  return { ok: true };
}

export async function doLogout() {
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error(error.message);
  return { ok: true };
}

export async function registerCompany(input: { data: { companyName: string; displayName: string; email: string; password: string } }) {
  const { companyName, displayName, email, password } = input.data;
  if (password.length < 12) throw new Error("A senha deve ter pelo menos 12 caracteres.");
  const { data, error } = await supabase.auth.signUp({
    email: email.trim().toLowerCase(),
    password,
    options: { data: { company_name: companyName.trim(), display_name: displayName.trim() } },
  });
  if (error) throw new Error(error.message);
  if (!data.session) return { ok: true, confirmationRequired: true };
  return { ok: true, confirmationRequired: false };
}

export async function requestPasswordReset(email: string) {
  const normalized = email.trim().toLowerCase();
  if (!normalized) throw new Error("Informe o e-mail cadastrado.");
  const { error } = await supabase.auth.resetPasswordForEmail(normalized, {
    redirectTo: `${window.location.origin}/login?recovery=1`,
  });
  if (error) throw new Error(error.message);
  return { ok: true };
}

export async function updateRecoveredPassword(password: string) {
  if (password.length < 12) throw new Error("A senha deve ter pelo menos 12 caracteres.");
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw new Error(error.message);
  return { ok: true };
}
