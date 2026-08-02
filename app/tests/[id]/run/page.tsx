import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getBanks } from "@/lib/questions.server";
import {
  buildSteps,
  progressFromAnswers,
  resumeIndex,
  shuffleStep,
  type AnsweredKey,
} from "@/lib/assessment";
import { phaseConfig } from "@/lib/phases";
import { stageById, stageIdOf } from "@/lib/stages";
import type { TestWithStudent } from "@/lib/types";
import { Runner, type RunnerStep } from "./Runner";
import { LocalRunner } from "./LocalRunner";

/**
 * Uma sessão = UMA etapa. O aplicador faz no máximo uma por dia e não emenda
 * uma na outra, então a sessão termina quando a etapa termina — nunca escorrega
 * para a etapa seguinte. Sem `?stage=`, aplica a próxima etapa pendente.
 */
export default async function RunPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ stage?: string }>;
}) {
  const { id } = await params;
  const { stage: wantStage } = await searchParams;
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

  const [byBank, { data: answers }] = await Promise.all([
    getBanks(supabase),
    // Só (fase, pergunta): aqui as respostas servem para achar onde retomar, e
    // `select("*")` traria junto a foto `presented` de cada uma.
    supabase
      .from("answers")
      .select("phase, question_id")
      .eq("test_id", id)
      .eq("history", false),
  ]);

  const allSteps = buildSteps(byBank, id);
  const answerList = (answers ?? []) as AnsweredKey[];

  // Banco sem perguntas (ex.: prod sem `npm run seed`): sem esta guarda, 0
  // passos seria lido como avaliação concluída e cairia na tela de parabéns.
  if (allSteps.length === 0) {
    return (
      <main className="min-h-[100dvh] flex items-center justify-center px-6 bg-[var(--blue-soft)]">
        <div className="bg-white rounded-3xl p-8 text-center max-w-sm w-full">
          <div className="text-5xl mb-3">🗂️</div>
          <h1 className="text-xl font-black mb-2">Perguntas não carregadas</h1>
          <p className="text-[var(--muted)] font-semibold mb-6">
            O banco de perguntas está vazio. Rode a carga (<code>npm run seed</code>)
            antes de aplicar a avaliação.
          </p>
          <a href={`/tests/${id}`} className="btn3d btn3d-green">
            Voltar
          </a>
        </div>
      </main>
    );
  }

  const { completed, currentStage } = progressFromAnswers(allSteps, answerList);

  if (wantStage && !stageById(wantStage)) notFound();
  const stageId = wantStage ?? currentStage;
  const stage = stageById(stageId);
  const steps = allSteps.filter((s) => stageIdOf(s) === stageId);

  const menuHref = `/tests/${id}/menu`;
  const at = resumeIndex(steps, answerList);

  // Avaliação inteira concluída e ninguém pediu etapa: tela final.
  const allDone = completed && !wantStage;
  // Etapa já concluída: entra em CONFERÊNCIA. Reaplicar não serviria — o
  // `is_correct` mede a PRIMEIRA tentativa e submitAnswer nunca o regrava, então
  // "responder de novo" só somaria tentativas a um dado já fechado.
  const review = !allDone && at >= steps.length;

  const correctKeys: Record<string, string> = {};
  const runnerSteps: RunnerStep[] = steps.map((s, i) => {
    const cfg = phaseConfig(s.phase);
    const q = shuffleStep(s, id);
    if (review) {
      const correct = q.options.find((o) => o.is_correct);
      if (correct) correctKeys[q.id] = correct.key;
    }
    return {
      phase: s.phase,
      stageLabel: stage?.label ?? cfg.label,
      feedback: cfg.feedbackPerQuestion,
      // A sessão é a etapa, então a barra mede a etapa. `indexInPhase` conta a
      // fase inteira e faria a barra da A1B03 começar já pela metade.
      indexInPhase: i,
      phaseTotal: steps.length,
      question: {
        id: q.id,
        context: q.context,
        phrases: q.phrases,
        image_key: q.image_key,
        etapa_label: q.etapa_label,
        question_text: q.question_text,
        // A marcação de correta é removida antes de hidratar: quem inspecionar
        // o HTML não pode achar a resposta. (Na conferência ela vai junto, de
        // propósito — ver LocalRunner.)
        options: q.options.map((o) => ({ key: o.key, text: o.text })),
      },
    };
  });

  if (review) {
    return (
      <LocalRunner
        testId={id}
        studentName={t.student?.name ?? ""}
        steps={runnerSteps}
        correctKeys={correctKeys}
        exitHref={menuHref}
        resultHref={menuHref}
        resultLabel="Voltar ao menu"
        doneMessage="Fim da conferência desta etapa."
        badge="Conferência · nada é salvo"
      />
    );
  }

  return (
    <Runner
      testId={id}
      studentName={t.student?.name ?? ""}
      steps={runnerSteps}
      startIndex={allDone ? steps.length : at}
      exitHref={menuHref}
      resultHref={menuHref}
      resultLabel="Voltar ao menu"
      doneMessage={
        allDone
          ? "Você concluiu toda a avaliação. Muito bem!"
          : "Você terminou esta parte. Muito bem!"
      }
    />
  );
}
