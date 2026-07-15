import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getBanks } from "@/lib/questions.server";
import { buildSteps } from "@/lib/assessment";
import { PHASES } from "@/lib/phases";
import type { Answer, Phase, Test } from "@/lib/types";

/**
 * Menu do aplicador: pular direto para uma fase — e, na Fase B, para uma
 * metáfora. Serve para aplicar ou conferir uma parte isolada; o fluxo do aluno
 * continua sendo o linear de /run, que retoma de onde parou.
 */
export default async function TestMenuPage({
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

  const { data: test } = await supabase
    .from("tests")
    .select("*")
    .eq("id", id)
    .single();
  if (!test) notFound();
  const t = test as Test;

  const [byBank, { data: answerData }] = await Promise.all([
    getBanks(supabase),
    supabase.from("answers").select("*").eq("test_id", id),
  ]);

  const steps = buildSteps(byBank, id);
  const answers = (answerData ?? []) as Answer[];
  const answered = new Set(answers.map((a) => `${a.phase}:${a.question_id}`));
  const isDone = (phase: Phase, questionId: string) =>
    answered.has(`${phase}:${questionId}`);

  return (
    <main className="min-h-screen bg-[#f7f9fc]">
      <header className="bg-white border-b-2 border-[var(--border)]">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <Link href={`/tests/${id}`} className="text-[var(--muted)] font-black">
            ←
          </Link>
          <div className="min-w-0">
            <h1 className="font-black text-lg truncate">{t.student_name}</h1>
            <p className="text-sm font-semibold text-[var(--muted)]">
              Escolher fase
            </p>
          </div>
          <Link href={`/tests/${id}/run`} className="btn3d btn3d-green ml-auto">
            Continuar
          </Link>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-6 flex flex-col gap-3">
        <p className="text-sm font-semibold text-[var(--muted)]">
          Ir direto para uma parte da avaliação. As respostas já dadas são
          mantidas — responder de novo sobrescreve a anterior.
        </p>

        {PHASES.map((cfg) => {
          const phaseSteps = steps.filter((s) => s.phase === cfg.phase);
          const done = phaseSteps.filter((s) =>
            isDone(s.phase, s.question.id)
          ).length;

          return (
            <section
              key={cfg.phase}
              className="bg-white rounded-2xl border-2 border-[var(--border)] overflow-hidden"
            >
              <Link
                href={`/tests/${id}/run?phase=${cfg.phase}`}
                className="flex items-center gap-3 p-4 hover:bg-[#f7f9fc] transition-colors"
              >
                <span className="min-w-0">
                  <span className="block font-black">{cfg.label}</span>
                  <span className="block text-sm font-semibold text-[var(--muted)]">
                    {done} / {phaseSteps.length} respondidas
                  </span>
                </span>
                <span className="ml-auto text-[var(--blue)] font-black text-xl">
                  →
                </span>
              </Link>

              {/* Submenu: uma entrada por metáfora treinada nesta parte da Fase B. */}
              {cfg.metaphors && (
                <ul className="border-t-2 border-[var(--border)]">
                  {cfg.metaphors.map((code) => {
                    const mSteps = phaseSteps.filter(
                      (s) => s.question.parent_metaphor_code === code
                    );
                    const mDone = mSteps.filter((s) =>
                      isDone(s.phase, s.question.id)
                    ).length;
                    const etapas = [
                      ...new Set(mSteps.map((s) => s.question.etapa_label)),
                    ].filter(Boolean);

                    return (
                      <li key={code}>
                        <Link
                          href={`/tests/${id}/run?phase=${cfg.phase}&metaphor=${code}`}
                          className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border)] last:border-b-0 hover:bg-[#f7f9fc] transition-colors"
                        >
                          <span className="min-w-0">
                            <span className="block font-bold text-sm">
                              {code} · {mSteps[0]?.question.metaphor ?? ""}
                            </span>
                            <span className="block text-xs font-semibold text-[var(--muted)]">
                              {etapas.join(" · ")} — {mDone} / {mSteps.length}
                            </span>
                          </span>
                          <span className="ml-auto text-[var(--muted)] font-black">
                            →
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </main>
  );
}
