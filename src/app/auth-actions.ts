"use server";

import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";

const back = (path: string, message: string): never => redirect(`${path}?error=${encodeURIComponent(message)}`);

export async function signIn(form: FormData) {
  const db = await supabaseServer();
  const { error } = await db.auth.signInWithPassword({
    email: String(form.get("email") ?? ""),
    password: String(form.get("password") ?? ""),
  });
  if (error) back("/login", error.message);
  const next = String(form.get("next") ?? "");
  redirect(next.startsWith("/dashboard") ? next : "/dashboard");
}

export async function signUp(form: FormData) {
  const password = String(form.get("password") ?? "");
  if (password.length < 8) back("/signup", "Use at least 8 characters for your password.");
  const db = await supabaseServer();
  const { data, error } = await db.auth.signUp({ email: String(form.get("email") ?? ""), password });
  if (error) back("/signup", error.message);
  // With email confirmation on, there is no session yet: ask them to check their inbox.
  if (!data.session) redirect("/login?check=email");
  redirect("/onboarding");
}

export async function signOut() {
  const db = await supabaseServer();
  await db.auth.signOut();
  redirect("/login");
}
