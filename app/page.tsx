import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getBanks } from "@/lib/questions.server";
import { totalSteps as countSteps } from "@/lib/assessment";
import { stageById } from "@/lib/stages";
import { TestActions } from "./tests/TestActions";
import type { Test } from "@/lib/types";

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

  const [{ data: tests }, byBank, { data: answerRows }] = await Promise.all([
    supabase
      .from("tests")
      .select("*")
      .order("created_at", { ascending: false }),
    getBanks(supabase),
    supabase.from("answers").select("test_id"),
  ]);

  const totalSteps = countSteps(byBank);
  const answeredByTest = new Map<string, number>();
  for (const r of answerRows ?? []) {
    answeredByTest.set(r.test_id, (answeredByTest.get(r.test_id) ?? 0) + 1);
  }

  const list = (tests ?? []) as Test[];

  return (
    <main className="min-h-screen bg-[#f7f9fc]">
      <header className="bg-white border-b-2 border-[var(--border)]">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🧠</span>
            <h1 className="text-lg sm:text-xl font-black">Avaliações</h1>
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
          <span className="ml-auto text-sm font-bold text-[var(--muted)]">
            {list.length} teste{list.length === 1 ? "" : "s"}
          </span>
        </div>

        {list.length === 0 ? (
          <div className="bg-white rounded-2xl p-10 text-center text-[var(--muted)] font-semibold">
            Nenhum teste ainda. Clique em{" "}
            <span className="text-[var(--green-dark)]">+ Novo aluno</span> para
            começar.
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {list.map((t) => {
              const answered = answeredByTest.get(t.id) ?? 0;
              const pct =
                totalSteps > 0 ? Math.round((answered / totalSteps) * 100) : 0;
              return (
                <li
                  key={t.id}
                  className="bg-white rounded-2xl p-4 sm:p-5 flex flex-col gap-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-black text-lg">
                          {t.student_name}
                        </span>
                        <span
                          className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                            t.status === "completed"
                              ? "bg-[var(--green-soft)] text-[var(--green-dark)]"
                              : "bg-[var(--blue-soft)] text-[var(--blue-dark)]"
                          }`}
                        >
                          {t.status === "completed"
                            ? "Concluído"
                            : `Em andamento · ${
                                stageById(t.current_stage)?.label ??
                                t.current_stage
                              }`}
                        </span>
                      </div>
                      <p className="text-sm text-[var(--muted)] font-semibold mt-0.5">
                        Nasc.: {formatDate(t.student_birth_date)} · Criado em{" "}
                        {formatDate(t.created_at)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/tests/${t.id}/run`}
                        className="btn3d btn3d-green !py-2 !px-4 text-sm"
                      >
                        {t.status === "completed" ? "Rever" : "Continuar"}
                      </Link>
                      <Link
                        href={`/tests/${t.id}`}
                        className="btn3d btn3d-gray !py-2 !px-4 text-sm"
                      >
                        Detalhes
                      </Link>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="progressbar flex-1">
                      <div style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-xs font-bold text-[var(--muted)] w-24 text-right">
                      {answered} / {totalSteps}
                    </span>
                  </div>

                  <div className="flex justify-end">
                    <TestActions testId={t.id} />
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
