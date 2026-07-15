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

  const steps = buildSteps(byBank, id);

  // Quantos passos cada fase tem — a Fase B filtra por metáfora, então isto
  // não é o tamanho do banco.
  const phaseTotals = new Map<Phase, number>();
  for (const s of steps) {
    phaseTotals.set(s.phase, (phaseTotals.get(s.phase) ?? 0) + 1);
  }

  // Por padrão retoma de onde parou; o menu do aplicador pode pedir uma fase
  // (e, na Fase B, uma metáfora) específica.
  let startIndex = resumeIndex(steps, (answers ?? []) as Answer[]);
  if (wantPhase) {
    const at = steps.findIndex(
      (s) =>
        s.phase === wantPhase &&
        (!wantMetaphor || s.question.parent_metaphor_code === wantMetaphor)
    );
    if (at >= 0) startIndex = at;
  }

  // Pré-embaralha as opções e remove a marcação de correta antes de enviar ao
  // cliente — quem inspecionar o HTML não pode achar a resposta.
  const runnerSteps: RunnerStep[] = steps.map((s) => {
    const cfg = phaseConfig(s.phase);
    const q = shuffleStep(s, id);
    return {
      phase: s.phase,
      phaseLabel: cfg.label,
      feedback: cfg.feedbackPerQuestion,
      indexInPhase: s.indexInPhase,
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
    />
  );
}
