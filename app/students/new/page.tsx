import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createTest } from "@/app/tests/actions";
import { BirthDatePicker } from "./BirthDatePicker";

export default async function NewStudentPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <main className="min-h-screen bg-[#f7f9fc]">
      <div className="max-w-md mx-auto px-4 py-8">
        <Link
          href="/"
          className="text-sm font-bold text-[var(--muted)] hover:underline"
        >
          ← Voltar
        </Link>

        <div className="bg-white rounded-3xl p-6 mt-4">
          <h1 className="text-xl font-black mb-1">Novo aluno</h1>
          <p className="text-[var(--muted)] font-semibold mb-6 text-sm">
            Cadastre o aluno para iniciar a avaliação. Em seguida, entregue o
            dispositivo para a criança responder.
          </p>

          <form action={createTest} className="flex flex-col gap-4">
            <label className="flex flex-col gap-1">
              <span className="text-sm font-bold text-[var(--muted)]">
                Nome do aluno
              </span>
              <input
                name="student_name"
                type="text"
                required
                autoFocus
                className="rounded-xl border-2 border-[var(--border)] px-4 py-3 font-semibold outline-none focus:border-[var(--blue)]"
                placeholder="Ex.: Maria Silva"
              />
            </label>
            <BirthDatePicker />

            <button className="btn3d btn3d-green w-full mt-2">
              Começar avaliação
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
