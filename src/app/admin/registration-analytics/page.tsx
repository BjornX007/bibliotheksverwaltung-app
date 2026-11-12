
import RegistrationAnalytics from "@/components/register/RegistrationAnalytics";
import { getCurrentUser } from "@/lib/auth";

export default async function RegistrationAnalyticsPage() {
  const auth = await getCurrentUser();

  if (!auth) {
    return (
      <main className="p-6">
        <p className="text-red-600">Please sign in to continue.</p>
      </main>
    );
  }

  const { data, error } = await auth.supabase
    .from("book_registration_events")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    console.error("REGISTRATION ANALYTICS:", error);

    return (
      <main className="p-6">
        <p className="text-red-600">
          Could not load registration analytics.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-7xl p-4 sm:p-6">
      <RegistrationAnalytics events={data ?? []} />
    </main>
  );
}
