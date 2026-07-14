"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type LoginState = { error?: string; message?: string };

export async function signIn(
  _prev: LoginState,
  formData: FormData
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Preencha e-mail e senha." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: "E-mail ou senha inválidos." };

  redirect("/");
}

export async function signUp(
  _prev: LoginState,
  formData: FormData
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Preencha e-mail e senha." };
  if (password.length < 6)
    return { error: "A senha precisa ter pelo menos 6 caracteres." };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) return { error: error.message };

  // Se a confirmação de e-mail estiver desativada, já vem uma sessão.
  if (data.session) redirect("/");
  return {
    message:
      "Conta criada! Verifique seu e-mail para confirmar o cadastro e depois faça login.",
  };
}
