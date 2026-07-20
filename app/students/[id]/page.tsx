import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getBanks } from "@/lib/questions.server";
import { totalSteps as countSteps } from "@/lib/assessment";
import { stageById } from "@/lib/stages";
import { createTestForStudent } from "@/app/tests/actions";
import { TestActions } from "@/app/tests/TestActions";
import type { Student, Test } from "@/lib/types";

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR");
}

export default async function StudentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: studentData } = await supabase
    .from("students")
    .select("*")
    .eq("id", id)
    .single();
  if (!studentData) notFound();

  const [{ data: tests }, byBank, { data: answerRows }] = await Promise.all([
    supabase
      .from("tests")
      .select("*")
      .eq("student_id", id)
      .order("created_at", { ascending: false }),
    getBanks(supabase),
    supabase.from("answers").select("test_id"),
  ]);

  const student = studentData as Student;
  const list = (tests ?? []) as Test[];
  const totalSteps = countSteps(byBank);
  const answeredByTest = new Map<string, number>();
  for (const row of answerRows ?? []) {
    answeredByTest.set(row.test_id, (answeredByTest.get(row.test_id) ?? 0) + 1);
  }

  return (
    <main className="min-h-screen bg-[#f7f9fc]">
      <header className="bg-white border-b-2 border-[var(--border)]">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-3">
          <Link href="/" className="text-[var(--muted)] font-black text-xl">
            ←
          </Link>
          <div className="min-w-0">
            <h1 className="font-black text-lg sm:text-xl truncate">
              {student.name}
            </h1>
            <p className="text-sm font-semibold text-[var(--muted)]">
              Nasc.: {formatDate(student.birth_date)}
            </p>
          </div>
          <form action={createTestForStudent} className="ml-auto">
            <input type="hidden" name="student_id" value={student.id} />
            <button className="btn3d btn3d-green">+ Nova avaliação</button>
          </form>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-xl font-black">Avaliações iniciadas</h2>
            <p className="text-sm font-semibold text-[var(--muted)]">
              Continue uma avaliação pendente ou reveja uma já concluída.
            </p>
          </div>
          <span className="text-sm font-bold text-[var(--muted)] shrink-0">
            {list.length} teste{list.length === 1 ? "" : "s"}
          </span>
        </div>

        {list.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 text-center text-[var(--muted)] font-semibold">
            Nenhuma avaliação iniciada.
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {list.map((test, index) => {
              const answered = answeredByTest.get(test.id) ?? 0;
              const pct =
                totalSteps > 0 ? Math.round((answered / totalSteps) * 100) : 0;
              const stage = stageById(test.current_stage);

              return (
                <li key={test.id} className="bg-white rounded-2xl p-4 sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-black text-lg">
                          Avaliação {list.length - index}
                        </h3>
                        <span
                          className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                            test.status === "completed"
                              ? "bg-[var(--green-soft)] text-[var(--green-dark)]"
                              : "bg-[var(--blue-soft)] text-[var(--blue-dark)]"
                          }`}
                        >
                          {test.status === "completed"
                            ? "Concluída"
                            : `Em andamento · ${stage?.label ?? test.current_stage}`}
                        </span>
                      </div>
                      <p className="text-sm text-[var(--muted)] font-semibold mt-0.5">
                        Iniciada em {formatDate(test.created_at)}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <Link
                        href={`/tests/${test.id}/run`}
                        className="btn3d btn3d-green !py-2 !px-4 text-sm"
                      >
                        {test.status === "completed" ? "Rever" : "Continuar"}
                      </Link>
                      <Link
                        href={`/tests/${test.id}`}
                        className="btn3d btn3d-gray !py-2 !px-4 text-sm"
                      >
                        Detalhes
                      </Link>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 mt-4">
                    <div className="progressbar flex-1">
                      <div style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-xs font-bold text-[var(--muted)] w-24 text-right">
                      {answered} / {totalSteps}
                    </span>
                  </div>

                  <div className="flex justify-end mt-3">
                    <TestActions testId={test.id} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}
