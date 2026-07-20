import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { TestWithStudent } from "@/lib/types";

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR");
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: tests } = await supabase
    .from("tests")
    .select("*, student:students(name, birth_date)")
    .order("created_at", { ascending: false });

  const list = (tests ?? []) as TestWithStudent[];
  const studentsById = new Map<
    string,
    { id: string; name: string; birthDate: string | null; tests: TestWithStudent[] }
  >();

  for (const test of list) {
    if (!test.student) continue;
    const student = studentsById.get(test.student_id) ?? {
      id: test.student_id,
      name: test.student.name,
      birthDate: test.student.birth_date,
      tests: [],
    };
    student.tests.push(test);
    studentsById.set(test.student_id, student);
  }

  const students = [...studentsById.values()];

  return (
    <main className="min-h-screen bg-[#f7f9fc]">
      <header className="bg-white border-b-2 border-[var(--border)]">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🧠</span>
            <h1 className="text-lg sm:text-xl font-black">Alunos</h1>
          </div>
          <form action="/auth/signout" method="post">
            <button className="text-sm font-bold text-[var(--muted)] hover:underline">
              Sair
            </button>
          </form>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="flex flex-wrap items-center gap-3 mb-6">
          <Link href="/students/new" className="btn3d btn3d-green">
            + Novo aluno
          </Link>
          <a
            href="/api/tests/export"
            className="btn3d btn3d-blue"
            aria-label="Exportar todos os testes em CSV"
          >
            Exportar CSV
          </a>
          <Link href="/questions" className="btn3d btn3d-gray">
            Perguntas
          </Link>
          <span className="ml-auto text-sm font-bold text-[var(--muted)]">
            {students.length} aluno{students.length === 1 ? "" : "s"}
          </span>
        </div>

        {list.length === 0 ? (
          <div className="bg-white rounded-2xl p-10 text-center text-[var(--muted)] font-semibold">
            Nenhum aluno ainda. Clique em{" "}
            <span className="text-[var(--green-dark)]">+ Novo aluno</span> para
            começar.
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {students.map((student) => {
              const inProgress = student.tests.filter(
                (test) => test.status === "in_progress"
              ).length;
              const latest = student.tests[0];
              return (
                <li
                  key={student.id}
                  className="bg-white rounded-2xl border-2 border-transparent hover:border-[var(--blue)] transition-colors"
                >
                  <Link
                    href={`/students/${student.id}`}
                    className="block p-4 sm:p-5"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="font-black text-lg truncate">
                          {student.name}
                        </h2>
                        <p className="text-sm text-[var(--muted)] font-semibold mt-0.5">
                          Nasc.: {formatDate(student.birthDate)}
                        </p>
                      </div>
                      <span className="text-[var(--blue)] font-black text-2xl shrink-0">
                        →
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-4 text-sm font-bold text-[var(--muted)]">
                      <span>
                        {student.tests.length} avaliação
                        {student.tests.length === 1 ? "" : "ões"}
                      </span>
                      {inProgress > 0 && (
                        <span className="text-[var(--blue-dark)]">
                          {inProgress} em andamento
                        </span>
                      )}
                      <span className="ml-auto">
                        Atualizado em {formatDate(latest?.created_at ?? null)}
                      </span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}
