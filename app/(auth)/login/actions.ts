"use server";

import { AuthError } from "next-auth";
import { signIn } from "@/auth";
import { loginSchema } from "@/lib/auth/schemas";

export async function loginAction(
  _prev: string | null,
  formData: FormData,
): Promise<string | null> {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return "Enter a valid email and password.";
  try {
    await signIn("credentials", { ...parsed.data, redirectTo: "/dashboard" });
  } catch (e) {
    if (e instanceof AuthError) return "Invalid email or password.";
    throw e; // redirect signal
  }
  return null;
}
