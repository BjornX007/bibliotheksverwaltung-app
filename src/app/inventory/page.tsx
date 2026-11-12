import { createClient } from "@/lib/supabase/server";
import InventoryClient from "@/components/inventory/InventoryClient";

export default async function InventoryPage() {
  const supabase = await createClient();

  const { data: categories } = await supabase
    .from("categories")
    .select("id, name_sq, name_en")
    .order("name_en");

  return <InventoryClient categories={categories ?? []} />;
}