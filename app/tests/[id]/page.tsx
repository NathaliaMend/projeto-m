import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getBanks } from "@/lib/questions.server";
import { PHASES, phaseConfig } from "@/lib/phases";
import { buildSteps } from "@/lib/assessment";
import type { Answer, Phase, Question, Test } from "@/lib/types";

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR");
}

export default async function TestDetailsPage({
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
    supabase
      .from("answers")
      .select("*")
      .eq("test_id", id)
      .order("answered_at", { ascending: true }),
  ]);
  const answers = (answerData ?? []) as Answer[];

  // Quantos passos cada fase tem. Não é o tamanho do banco: B1/B2 filtram por
  // metáfora, e A/AR1/AR2 compartilham o mesmo banco.
  const phaseTotals = new Map<Phase, number>();
  for (const s of buildSteps(byBank, id)) {
    phaseTotals.set(s.phase, (phaseTotals.get(s.phase) ?? 0) + 1);
  }

  const questionById = new Map<string, Question>();
  for (const list of Object.values(byBank)) {
    for (const q of list) questionById.set(q.id, q);
  }

  const answersByPhase = new Map<Phase, Answer[]>();
  for (const a of answers) {
    const list = answersByPhase.get(a.phase) ?? [];
    list.push(a);
    answersByPhase.set(a.phase, list);
  }

  return (
    <main className="min-h-screen bg-[#f7f9fc]">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <Link
          href="/"
          className="text-sm font-bold text-[var(--muted)] hover:underline"
        >
          ← Voltar
        </Link>

        <div className="bg-white rounded-3xl p-6 mt-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h1 className="text-2xl font-black">{t.student_name}</h1>
              <p className="text-sm text-[var(--muted)] font-semibold">
                Nasc.: {formatDate(t.student_birth_date)}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href={`/tests/${t.id}/menu`}
                className="btn3d !py-2 !px-4 text-sm"
              >
                Escolher fase
              </Link>
              <Link
                href={`/tests/${t.id}/run`}
                className="btn3d btn3d-green !py-2 !px-4 text-sm"
              >
                {t.status === "completed" ? "Rever" : "Continuar"}
              </Link>
            </div>
          </div>

          {/* Pontuação por fase. `is_correct` = acertou de primeira. */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-6">
            {PHASES.map((pc) => {
              const cfg = phaseConfig(pc.phase);
              const total = phaseTotals.get(pc.phase) ?? 0;
              const phaseAnswers = answersByPhase.get(pc.phase) ?? [];
              const correct = phaseAnswers.filter((a) => a.is_correct).length;
              return (
                <div
                  key={pc.phase}
                  className="bg-[#f7f9fc] rounded-2xl p-4 text-center"
                >
                  <div className="text-xs font-black text-[var(--muted)] uppercase">
                    {cfg.label}
                  </div>
                  <div className="text-2xl font-black mt-1">
                    {correct}
                    <span className="text-[var(--muted)] text-base">
                      /{total}
                    </span>
                  </div>
                  <div className="text-xs font-semibold text-[var(--muted)]">
                    {phaseAnswers.length} respondida
                    {phaseAnswers.length === 1 ? "" : "s"}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Respostas detalhadas */}
        {PHASES.map((pc) => {
          const phaseAnswers = answersByPhase.get(pc.phase) ?? [];
          if (phaseAnswers.length === 0) return null;
          return (
            <section key={pc.phase} className="mt-6">
              <h2 className="text-lg font-black mb-3 px-1">
                {phaseConfig(pc.phase).label}
              </h2>
              <ul className="flex flex-col gap-2">
                {phaseAnswers.map((a) => {
                  const q = questionById.get(a.question_id);
                  const selected = q?.options.find(
                    (o) => o.key === a.selected_key
                  );
                  const correctOpt = q?.options.find((o) => o.is_correct);
                  return (
                    <li
                      key={a.id}
                      className="bg-white rounded-2xl p-4 flex gap-3"
                    >
                      <span className="text-xl">
                        {a.is_correct ? "✅" : "❌"}
                      </span>
                      <div className="min-w-0">
                        <p className="font-bold leading-snug">
                          {q?.question_text ?? "—"}
                        </p>
                        <p className="text-sm font-semibold text-[var(--muted)] mt-1">
                          1ª resposta: {selected?.text ?? a.selected_key}
                        </p>
                        {!a.is_correct && correctOpt && (
                          <p className="text-sm font-semibold text-[var(--green-dark)] mt-0.5">
                            Correta: {correctOpt.text}
                          </p>
                        )}
                        {/* Só a Fase B tem retentativa; nas demais attempts é 1. */}
                        {a.attempts > 1 && (
                          <p className="text-sm font-semibold text-[var(--muted)] mt-0.5">
                            {a.attempts} tentativas ·{" "}
                            {a.solved
                              ? "acertou depois"
                              : "não chegou na correta"}
                          </p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </main>
  );
}
