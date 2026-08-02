import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getBanks } from "@/lib/questions.server";
import { PHASES, phaseConfig } from "@/lib/phases";
import { buildSteps } from "@/lib/assessment";
import { formatDuration } from "@/lib/duration";
import { createTestForStudent } from "@/app/tests/actions";
import type { Answer, Phase, TestWithStudent } from "@/lib/types";
import { HistorySidebar } from "./HistorySidebar";

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
    .select("*, student:students(name, birth_date)")
    .eq("id", id)
    .single();
  if (!test) notFound();
  const t = test as TestWithStudent;

  const [byBank, { data: answerData }] = await Promise.all([
    getBanks(supabase),
    supabase
      .from("answers")
      .select("*")
      .eq("test_id", id)
      .order("answered_at", { ascending: true }),
  ]);
  const allAnswers = (answerData ?? []) as Answer[];
  const answers = allAnswers.filter((answer) => !answer.history);
  const historiesByQuestion = new Map<string, Answer[]>();
  for (const answer of allAnswers) {
    if (!answer.history) continue;
    const key = `${answer.phase}:${answer.question_id}`;
    const list = historiesByQuestion.get(key) ?? [];
    list.push(answer);
    historiesByQuestion.set(key, list);
  }
  const displayAnswersByPhase = new Map<Phase, Answer[]>();
  for (const answer of answers) {
    const list = displayAnswersByPhase.get(answer.phase) ?? [];
    list.push(answer);
    displayAnswersByPhase.set(answer.phase, list);
  }
  for (const [key, history] of historiesByQuestion) {
    const [phase, questionId] = key.split(":") as [Phase, string];
    const hasActive = answers.some(
      (answer) => answer.phase === phase && answer.question_id === questionId
    );
    if (hasActive) continue;
    const list = displayAnswersByPhase.get(phase) ?? [];
    list.push(history[history.length - 1]);
    displayAnswersByPhase.set(phase, list);
  }
  const durationOf = (a: Answer) =>
    (a.durations_ms ?? []).reduce((sum, duration) => sum + duration, 0);
  const totalDuration = answers.reduce(
    (sum, answer) => sum + durationOf(answer),
    0
  );

  // Aparelho(s) usado(s) na aplicação — normalmente um só; se houver mais de um
  // (ex.: Fase C num aparelho diferente), lista todos.
  const devices = [...new Set(answers.map((a) => a.device).filter(Boolean))];

  // Quantos passos cada fase tem. Não é o tamanho do banco: B1/B2 filtram por
  // metáfora, e A/AR1/AR2 compartilham o mesmo banco.
  const phaseTotals = new Map<Phase, number>();
  for (const s of buildSteps(byBank, id)) {
    phaseTotals.set(s.phase, (phaseTotals.get(s.phase) ?? 0) + 1);
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
              <h1 className="text-2xl font-black">{t.student?.name ?? "—"}</h1>
              <p className="text-sm text-[var(--muted)] font-semibold">
                Nasc.: {formatDate(t.student?.birth_date ?? null)}
              </p>
              {devices.length > 0 && (
                <p className="text-sm text-[var(--muted)] font-semibold">
                  Dispositivo: {devices.join(", ")}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Link
                href={`/tests/${t.id}/menu`}
                className="btn3d btn3d-gray !py-2 !px-4 text-sm"
              >
                Escolher etapa
              </Link>
              <Link
                href={`/tests/${t.id}/run`}
                className="btn3d btn3d-green !py-2 !px-4 text-sm"
              >
                {t.status === "completed" ? "Rever" : "Continuar"}
              </Link>
              {/* Reaplicar: nova aplicação para o MESMO aluno. */}
              <form action={createTestForStudent}>
                <input type="hidden" name="student_id" value={t.student_id} />
                <button className="btn3d btn3d-blue !py-2 !px-4 text-sm">
                  Novo teste
                </button>
              </form>
            </div>
          </div>

          {/* Pontuação por fase. `is_correct` = acertou de primeira. */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-6">
            {PHASES.map((pc) => {
              const cfg = phaseConfig(pc.phase);
              const total = phaseTotals.get(pc.phase) ?? 0;
              const activePhaseAnswers = answersByPhase.get(pc.phase) ?? [];
              const correct = activePhaseAnswers.filter(
                (a) => a.is_correct
              ).length;
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
                    {activePhaseAnswers.length} respondida
                    {activePhaseAnswers.length === 1 ? "" : "s"}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-sm font-bold text-[var(--muted)] mt-4 text-center">
            Tempo total: {formatDuration(totalDuration)}
          </p>
        </div>

        {/* Respostas detalhadas */}
        {PHASES.map((pc) => {
          const phaseAnswers = displayAnswersByPhase.get(pc.phase) ?? [];
          if (phaseAnswers.length === 0) return null;
          return (
            <section key={pc.phase} className="mt-6">
              <h2 className="text-lg font-black mb-3 px-1">
                {phaseConfig(pc.phase).label}
              </h2>
              <ul className="flex flex-col gap-2">
                {phaseAnswers.map((a) => {
                  // A pergunta como a criança viu, não como ela está hoje no
                  // banco: re-semear as planilhas não pode mudar um registro.
                  const p = a.presented;
                  const isHistorical = a.history;
                  const selected = p.options.find(
                    (o) => o.key === a.selected_key
                  );
                  const correctOpt = p.options.find((o) => o.is_correct);
                  const history =
                    historiesByQuestion.get(`${a.phase}:${a.question_id}`) ?? [];
                  return (
                    <li
                      key={a.id}
                      className={`bg-white rounded-2xl p-4 flex gap-3 ${
                        isHistorical ? "border-2 border-[#f0d58a]" : ""
                      }`}
                    >
                      <span className="text-xl">
                        {isHistorical ? "🗃️" : a.is_correct ? "✅" : "❌"}
                      </span>
                      <div className="min-w-0 flex-1">
                        {isHistorical && (
                          <p className="text-xs font-black uppercase text-[#9a7312] mb-1">
                            Registro histórico · aplicação {a.attempt_round}
                          </p>
                        )}
                        <p className="font-bold leading-snug">
                          {p.question_text}
                        </p>
                        <p className="text-sm font-semibold text-[var(--muted)] mt-1">
                          1ª resposta: {selected?.text ?? a.selected_key}
                        </p>
                        <p className="text-sm font-semibold text-[var(--muted)] mt-0.5">
                          Tempo: {formatDuration(durationOf(a))} · 1ª resposta: {formatDuration(
                            a.durations_ms?.[0] ?? 0
                          )}
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
                              ? `errou ${a.attempts - 1}× antes de acertar`
                              : "não chegou na correta"}
                          </p>
                        )}
                      </div>
                      {history.length > 0 && (
                        <HistorySidebar history={history} questionText={p.question_text} />
                      )}
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
