import { Logo } from "@/components/logo";

export default function CatalogoNoEncontrado() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4">
      <div className="w-full max-w-sm space-y-4 text-center">
        <div className="flex justify-center">
          <Logo href="#" />
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 text-sm text-zinc-600 shadow-sm">
          Este link ya no está activo. Pídele a Daymart uno nuevo.
        </div>
      </div>
    </div>
  );
}
