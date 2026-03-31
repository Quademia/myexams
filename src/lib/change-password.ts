// src/lib/change-password.ts
// Shared server action for changing password from the ProfileDrawer.
// Used by any workspace page that renders the sidebar with profile props.

"use server";

import { redirect } from "next/navigation";
import { requireAuth, pbkdf2Hex, randomSaltHex } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { getEnv } from "@/lib/env";

export async function changePasswordAction(formData: FormData) {
  const auth = await requireAuth();

  const currentPw = formData.get("current_password") as string || "";
  const newPw = formData.get("new_password") as string || "";
  const confirmPw = formData.get("confirm_password") as string || "";

  // Get the current URL path so we redirect back to where the user was.
  const returnTo = (formData.get("return_to") as string) || "/profile";

  if (newPw.length < 6) redirect(`${returnTo}?error=${encodeURIComponent("New password must be 6+ characters.")}`);
  if (newPw !== confirmPw) redirect(`${returnTo}?error=${encodeURIComponent("Passwords do not match.")}`);

  const { first, run } = getDb();
  const { APP_SECRET } = getEnv();

  const u = await first<{ id: string; password_salt: string; password_hash: string; password_iter: number }>(
    "SELECT id, password_salt, password_hash, password_iter FROM qa_users WHERE id=? AND status='ACTIVE'",
    [auth.user!.id]
  );
  if (!u) redirect("/logout");

  const check = await pbkdf2Hex(currentPw + "|" + APP_SECRET, u.password_salt, Number(u.password_iter));
  if (check !== u.password_hash) redirect(`${returnTo}?error=${encodeURIComponent("Current password is incorrect.")}`);

  const saltHex = randomSaltHex();
  const iter = 40000;
  const hashHex = await pbkdf2Hex(newPw + "|" + APP_SECRET, saltHex, iter);
  await run("UPDATE qa_users SET password_salt=?, password_hash=?, password_iter=?, updated_at=? WHERE id=?",
    [saltHex, hashHex, iter, new Date().toISOString(), auth.user!.id]);

  redirect(`${returnTo}?success=1`);
}
