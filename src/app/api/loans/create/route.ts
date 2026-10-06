import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const DATE = /^\d{4}-\d{2}-\d{2}$/;

const text = (value: unknown, max: number) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

export async function POST(request: NextRequest) {
  const auth = await getCurrentUser();

  if (!auth) {
    return NextResponse.json(
      { error: "UNAUTHORIZED" },
      { status: 401 },
    );
  }

  const { supabase } = auth;

  const body = await request.json().catch(() => null);

  const bookId = text(body?.bookId, 40);
  const studentId = text(body?.studentId, 40);
  const fullName = text(body?.fullName, 100);
  const className = text(body?.className, 30);
  const dueAt = text(body?.dueAt, 10);

  const due = DATE.test(dueAt)
    ? new Date(`${dueAt}T00:00:00Z`)
    : null;

  const daysAhead = due
    ? (due.getTime() - Date.now()) / 86_400_000
    : NaN;

  const validStudentId =
    studentId === "" || UUID.test(studentId);

  if (
    !UUID.test(bookId) ||
    !validStudentId ||
    fullName.length < 2 ||
    !due ||
    Number.isNaN(due.getTime()) ||
    daysAhead < -1 ||
    daysAhead > 400
  ) {
    return NextResponse.json(
      { error: "INVALID_INPUT" },
      { status: 400 },
    );
  }

  const { data, error } = await supabase.rpc("create_loan", {
    p_book_id: bookId,
    p_class_name: className,
    p_due_at: dueAt,
    p_full_name: fullName,
    p_student_id: studentId || null,
  });

  if (error) {
    const known = [
      "NO_COPIES",
      "ALREADY_LOANED",
      "INVALID_STUDENT",
    ].find((code) =>
      (error.message ?? "").includes(code),
    );

    if (known) {
      return NextResponse.json(
        { error: known },
        { status: 409 },
      );
    }

    console.error("create_loan failed:", error.message);

    return NextResponse.json(
      { error: "LOAN_FAILED" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    loanId: data,
  });
}