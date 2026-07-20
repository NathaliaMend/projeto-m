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
import { STAGES, stageIdOf } from "@/lib/stages";
import type { TestWithStudent } from "@/lib/types";

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

        {STAGES.map((stage) => {
          const stageSteps = byStage.get(stage.id) ?? [];
          const done = stageSteps.filter((s) =>
            answered.has(`${s.phase}:${s.question.id}`)
          ).length;
          const total = stageSteps.length;
          const complete = total > 0 && done === total;
          const isNext = stage.id === currentStage && !complete;
          const metaphorText = stage.metaphor
            ? (stageSteps[0]?.question.metaphor ?? "")
            : "";

          return (
            <Link
              key={stage.id}
              href={`/tests/${id}/run?stage=${stage.id}`}
              className={`flex items-center gap-3 bg-white rounded-2xl border-2 p-4 transition-colors hover:bg-[#f7f9fc] ${
                isNext ? "border-[var(--green)]" : "border-[var(--border)]"
              }`}
            >
              <span className="text-xl w-6 text-center shrink-0">
                {complete ? "✅" : isNext ? "👉" : "⚪️"}
              </span>
              <span className="min-w-0">
                <span className="block font-black">{stage.label}</span>
                <span className="block text-sm font-semibold text-[var(--muted)]">
                  {metaphorText && `${metaphorText} · `}
                  {complete
                    ? `${total} respondidas`
                    : `faltam ${total - done} de ${total}`}
                </span>
              </span>
              <span
                className={`ml-auto text-sm font-black shrink-0 ${
                  isNext ? "text-[var(--green-dark)]" : "text-[var(--muted)]"
                }`}
              >
                {complete ? "Conferir" : done > 0 ? "Continuar" : "Aplicar"}
              </span>
            </Link>
          );
        })}
      </div>
    </main>
  );
}
