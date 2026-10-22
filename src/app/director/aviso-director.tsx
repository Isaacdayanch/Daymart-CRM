import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

async function contarPendientes() {
  try {
    const supabase = await createClient();
    const { count, error } = await supabase.from("director_propuestas").select("id", { count: "exact", head: true }).eq("estado", "PROPUESTA");
    return error ? 0 : (count ?? 0);
  } catch {
    return 0;
  }
}

/** Caja en el inicio: "El Director te dejó N propuestas" (solo dueño). Si no
 * hay nada pendiente o falta el SQL, no estorba. */
export async function AvisoDirector() {
  const count = await contarPendientes();
  if (!count) return null;
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#2D3277]/20 bg-[#2D3277]/5 px-4 py-3 text-sm text-[#2D3277]">
      <span>
        El Director Meli te dejó <strong>{count}</strong> propuesta{count === 1 ? "" : "s"} esperando tu decisión.
      </span>
      <Link href="/director" className="rounded-lg bg-[#2D3277] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#232862]">
        Revisar →
      </Link>
    </div>
  );
}
