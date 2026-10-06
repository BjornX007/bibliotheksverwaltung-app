// src/app/api/loans/students/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";

export async function GET(request: NextRequest) {
  const auth = await getCurrentUser();

  if (!auth) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const { supabase } = auth;

  const raw = (request.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 60);

  // wildcards typed by the user must not act as wildcards
  const safe = raw
    .replace(/[%_\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (safe.length < 2) {
    return NextResponse.json({ students: [] });
  }

const { data, error } = await supabase
  .from("students")
  .select("id, full_name, class_name")
  .ilike("full_name", `%${safe}%`)
  .eq("active", true)
  .order("full_name")
  .limit(10);

  if (error) {
    console.error("student search failed:", error.message);
    return NextResponse.json({ error: "LOAN_FAILED" }, { status: 500 });
  }

 return NextResponse.json({ students: data ?? [] });
}