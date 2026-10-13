"use server";

import { redirect } from "next/navigation";
import { createSession, destroySession, hashPassword, verifyPassword } from "@/lib/auth";
import { one, pgCode, sql } from "@/lib/db";

const back = (path: string, message: string): never => redirect(`${path}?error=${encodeURIComponent(message)}`);
const emailOf = (form: FormData) => String(form.get("email") ?? "").trim().toLowerCase();

export async function signIn(form: FormData) {
  const email = emailOf(form);
  const password = String(form.get("password") ?? "");
  const user = await one<{ id: string; password_hash: string }>(sql`select id, password_hash from users where email = ${email}`);
  // Same message either way, so the form doesn't reveal which emails have accounts.
  if (!user || !(await verifyPassword(password, user.password_hash))) back("/login", "That email and password don't match.");
  await createSession(user!.id);
  const next = String(form.get("next") ?? "");
  redirect(next.startsWith("/dashboard") ? next : "/dashboard");
}

export async function signUp(form: FormData) {
  const email = emailOf(form);
  const password = String(form.get("password") ?? "");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) back("/signup", "Enter a valid email address.");
  if (password.length < 8) back("/signup", "Use at least 8 characters for your password.");
  let userId: string | undefined;
  try {
    const row = await one<{ id: string }>(sql`insert into users (email, password_hash) values (${email}, ${await hashPassword(password)}) returning id`);
    userId = row?.id;
  } catch (err) {
    if (pgCode(err) === "23505") back("/signup", "An account with that email already exists. Log in instead.");
    throw err;
  }
  await createSession(userId!);
  redirect("/onboarding");
}

export async function signOut() {
  await destroySession();
  redirect("/login");
}
