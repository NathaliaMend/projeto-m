import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getBanks } from "@/lib/questions.server";
import { buildSteps, resumeIndex, shuffleStep } from "@/lib/assessment";
import { phaseConfig } from "@/lib/phases";
import type { Answer, Phase, Test } from "@/lib/types";
import { Runner, type RunnerStep } from "./Runner";

export default async function RunPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ phase?: string; metaphor?: string }>;
}) {
  const { id } = await params;
  const { phase: wantPhase, metaphor: wantMetaphor } = await searchParams;
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

  const [byBank, { data: answers }] = await Promise.all([
    getBanks(supabase),
    supabase.from("answers").select("*").eq("test_id", id),
  ]);

  const allSteps = buildSteps(byBank, id);
  const answerList = (answers ?? []) as Answer[];

  // Escolher uma metáfora no menu LIMITA a sessão a ela: o treino da Fase B é
  // aplicado no máximo uma metáfora por dia, então a sessão tem que terminar
  // quando a metáfora termina, em vez de emendar na próxima.
  const scoped =
    wantPhase && wantMetaphor
      ? allSteps.filter(
          (s) =>
            s.phase === wantPhase &&
            s.question.parent_metaphor_code === wantMetaphor
        )
      : null;
  const steps = scoped?.length ? scoped : allSteps;

  // Quantos passos cada fase tem — a Fase B filtra por metáfora, então isto
  // não é o tamanho do banco.
  const phaseTotals = new Map<Phase, number>();
  for (const s of steps) {
    phaseTotals.set(s.phase, (phaseTotals.get(s.phase) ?? 0) + 1);
  }

  // Por padrão retoma de onde parou; o menu do aplicador pode pedir uma fase
  // (e, na Fase B, uma metáfora) específica.
  let startIndex = resumeIndex(steps, answerList);
  if (scoped?.length) {
    // Retoma no meio da metáfora se o dia foi interrompido. Se ela já estiver
    // completa, reaplica do começo — o aplicador só chega aqui por escolha
    // explícita no menu, que já avisa que responder de novo sobrescreve.
    if (startIndex >= steps.length) startIndex = 0;
  } else if (wantPhase) {
    const at = steps.findIndex((s) => s.phase === wantPhase);
    if (at >= 0) startIndex = at;
  }

  // Pré-embaralha as opções e remove a marcação de correta antes de enviar ao
  // cliente — quem inspecionar o HTML não pode achar a resposta.
  const runnerSteps: RunnerStep[] = steps.map((s, i) => {
    const cfg = phaseConfig(s.phase);
    const q = shuffleStep(s, id);
    return {
      phase: s.phase,
      phaseLabel: cfg.label,
      feedback: cfg.feedbackPerQuestion,
      // Na sessão de uma metáfora só, a barra de progresso mede a metáfora —
      // `indexInPhase` conta a fase inteira e a barra começaria pela metade.
      indexInPhase: scoped?.length ? i : s.indexInPhase,
      phaseTotal: phaseTotals.get(s.phase) ?? 0,
      question: {
        id: q.id,
        context: q.context,
        phrases: q.phrases,
        image_key: q.image_key,
        etapa_label: q.etapa_label,
        question_text: q.question_text,
        options: q.options.map((o) => ({ key: o.key, text: o.text })),
      },
    };
  });

  return (
    <Runner
      testId={id}
      studentName={t.student_name}
      steps={runnerSteps}
      startIndex={startIndex}
      {...(scoped?.length
        ? {
            doneMessage: "Você terminou esta parte. Muito bem!",
            exitHref: `/tests/${id}/menu`,
            resultHref: `/tests/${id}/menu`,
            resultLabel: "Voltar ao menu",
          }
        : {})}
    />
  );
}
