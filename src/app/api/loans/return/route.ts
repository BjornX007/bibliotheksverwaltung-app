// src/app/api/loans/return/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  const auth = await getCurrentUser();

  if (!auth) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const { supabase } = auth;

  const body = await request.json().catch(() => null);
  const loanId = typeof body?.loanId === "string" ? body.loanId.trim() : "";

  if (!UUID.test(loanId)) {
    return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  }

  const { error } = await supabase.rpc("return_loan", { p_loan_id: loanId });

  if (error) {
    if ((error.message ?? "").includes("NOT_FOUND")) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }

    console.error("return_loan failed:", error.message);
    return NextResponse.json({ error: "LOAN_FAILED" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}