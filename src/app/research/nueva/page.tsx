import Link from "next/link";
import { FormularioInvestigacion } from "./formulario-investigacion";

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
