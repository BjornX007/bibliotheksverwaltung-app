// src/app/inventory/page.tsx
import InventoryClient from "@/components/inventory/InventoryClient";

export default function InventoryPage() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 pb-10">
      <InventoryClient />
    </main>
  );
}