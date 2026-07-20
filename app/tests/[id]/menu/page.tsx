import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getBanks } from "@/lib/questions.server";
import {
  buildSteps,
  progressFromAnswers,
  type AnsweredKey,
  type Step,
} from "@/lib/assessment";
import { stageIdOf } from "@/lib/stages";
import { PHASES } from "@/lib/phases";
import type { Phase, TestWithStudent } from "@/lib/types";

/** Mesmos emojis por fase do /preview, para o menu ter a mesma cara. */
const PHASE_EMOJI: Record<Phase, string> = {
  A: "🌱",
  B1: "🚀",
  AR1: "🌿",
  B2: "🛸",
  AR2: "🌳",
  C: "🏆",
};

/**
 * Menu do aplicador: as 9 ETAPAS de aplicação, na ordem, com o que já foi
 * respondido e o que falta. É a tela que responde "onde ela parou" e "o que
 * aplico hoje" — a aplicação é no máximo uma etapa por dia.
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
    .select("*, student:students(name, birth_date)")
    .eq("id", id)
    .single();
  if (!test) notFound();
  const t = test as TestWithStudent;

  const [byBank, { data: answerData }] = await Promise.all([
    getBanks(supabase),
    // Só (fase, pergunta): o menu conta progresso, não exibe respostas —
    // `select("*")` traria a foto `presented` das 100.
    supabase.from("answers").select("phase, question_id").eq("test_id", id),
  ]);

  const steps = buildSteps(byBank, id);
  const answers = (answerData ?? []) as AnsweredKey[];
  const answered = new Set(answers.map((a) => `${a.phase}:${a.question_id}`));
  const { currentStage } = progressFromAnswers(steps, answers);

  // Os passos de cada etapa, agrupados por stageIdOf — a mesma regra que o
  // /run usa para limitar a sessão.
  const byStage = new Map<string, Step[]>();
  for (const s of steps) {
    const list = byStage.get(stageIdOf(s)) ?? [];
    list.push(s);
    byStage.set(stageIdOf(s), list);
  }

  return (
    <main className="min-h-screen bg-[#f7f9fc]">
      <header className="bg-white border-b-2 border-[var(--border)]">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <Link href={`/tests/${id}`} className="text-[var(--muted)] font-black">
            ←
          </Link>
          <div className="min-w-0">
            <h1 className="font-black text-lg truncate">
              {t.student?.name ?? "—"}
            </h1>
            <p className="text-sm font-semibold text-[var(--muted)]">
              Escolher etapa
            </p>
          </div>
          <Link href={`/tests/${id}/run`} className="btn3d btn3d-green ml-auto">
            Continuar
          </Link>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-6 flex flex-col gap-3">
        <p className="text-sm font-semibold text-[var(--muted)]">
          Uma etapa por dia. O “Continuar” aplica a próxima pendente e termina
          nela. Etapa concluída abre em conferência — nada é gravado.
        </p>

        {/* Antes da Fase A: ensina a mecânica do app. Nada é gravado. */}
        <Link
          href="/tutorial"
          className="flex items-center gap-3 bg-white rounded-2xl border-2 border-[var(--blue)] p-4 hover:bg-[var(--blue-soft)] transition-colors"
        >
          <span className="text-2xl">👋</span>
          <span className="min-w-0">
            <span className="block font-black">Tutorial guiado</span>
            <span className="block text-sm font-semibold text-[var(--muted)]">
              3 exemplos · aplicar antes da Fase A · nada é gravado
            </span>
          </span>
          <span className="ml-auto text-[var(--blue)] font-black text-xl">→</span>
        </Link>

        {PHASES.map((pc) => {
          const doneOf = (list: Step[]) =>
            list.filter((s) => answered.has(`${s.phase}:${s.question.id}`)).length;
          const label = (done: number, total: number) =>
            total > 0 && done === total
              ? "Conferir"
              : done > 0
                ? "Continuar"
                : "Aplicar";

          const phaseSteps = steps.filter((s) => s.phase === pc.phase);
          const total = phaseSteps.length;
          const done = doneOf(phaseSteps);

          // Fase B (B1/B2): card-cabeçalho com submenu de metáforas — é assim que
          // ela é aplicada, uma metáfora por vez.
          if (pc.metaphors) {
            return (
              <div
                key={pc.phase}
                className="bg-white rounded-2xl border-2 border-[var(--border)] p-4"
              >
                <div className="flex items-center gap-4">
                  <span className="text-3xl">{PHASE_EMOJI[pc.phase]}</span>
                  <span className="min-w-0">
                    <span className="block font-black text-lg">{pc.label}</span>
                    <span className="block text-sm font-semibold text-[var(--muted)]">
                      {done} / {total} respondidas
                    </span>
                  </span>
                </div>

                <ul className="mt-3 ml-6 flex flex-col gap-1.5">
                  {pc.metaphors.map((code) => {
                    const ms = byStage.get(code) ?? [];
                    const mDone = doneOf(ms);
                    const isNext = code === currentStage;
                    return (
                      <li key={code}>
                        <Link
                          href={`/tests/${id}/run?stage=${code}`}
                          className={`flex items-center gap-3 rounded-xl px-3 py-2 border-2 transition-colors hover:bg-[#f7f9fc] ${
                            isNext
                              ? "border-[var(--green)]"
                              : "border-[var(--border)]"
                          }`}
                        >
                          <span className="font-bold text-sm shrink-0">
                            {code}
                          </span>
                          <span className="text-xs font-semibold text-[var(--muted)] truncate">
                            {ms[0]?.question.metaphor ?? ""}
                          </span>
                          <span className="ml-auto text-xs font-black text-[var(--muted)] shrink-0">
                            {mDone}/{ms.length} · {label(mDone, ms.length)}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          }

          // A / AR1 / AR2 / C: uma etapa só (stageId = a própria fase).
          const isNext = pc.phase === currentStage;
          return (
            <Link
              key={pc.phase}
              href={`/tests/${id}/run?stage=${pc.phase}`}
              className={`flex items-center gap-4 bg-white rounded-2xl border-2 p-4 transition-colors hover:bg-[#f7f9fc] ${
                isNext ? "border-[var(--green)]" : "border-[var(--border)]"
              }`}
            >
              <span className="text-3xl">{PHASE_EMOJI[pc.phase]}</span>
              <span className="min-w-0">
                <span className="block font-black text-lg">{pc.label}</span>
                <span className="block text-sm font-semibold text-[var(--muted)]">
                  {done} / {total} respondidas
                </span>
              </span>
              <span className="ml-auto text-sm font-black shrink-0 text-[var(--muted)]">
                {label(done, total)}
              </span>
            </Link>
          );
        })}
      </div>
    </main>
  );
}
