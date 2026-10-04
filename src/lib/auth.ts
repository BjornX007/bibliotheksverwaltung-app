// src/lib/auth.ts
import { createClient } from "./supabase/server";

/**
 * Call this at the top of EVERY route handler and server action.
 * getUser() asks the Supabase Auth server, so a revoked session is rejected at once.
 * Returns null when nobody is logged in.
 *
 * Example:
 *   const auth = await getCurrentUser();
 *   if (!auth) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
 */
export async function getCurrentUser() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return { supabase, user: data.user };
}