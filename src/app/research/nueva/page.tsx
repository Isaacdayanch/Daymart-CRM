import Link from "next/link";
import { FormularioInvestigacion } from "./formulario-investigacion";

// Las llamadas a Mercado Libre pueden tardar: se sube el tope de tiempo de Vercel (máx. 60 s en plan Hobby).
export const maxDuration = 60;

export default function NuevaInvestigacion() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link href="/research" className="text-sm font-medium text-zinc-500 hover:text-zinc-900">
        ← Research
      </Link>
      <FormularioInvestigacion />
    </div>
  );
}
