import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getBanks } from "@/lib/questions.server";
import { buildSteps, resumeIndex, shuffleStep } from "@/lib/assessment";
import { phaseConfig } from "@/lib/phases";
import type { Answer, Test } from "@/lib/types";
import { Runner, type RunnerStep } from "./Runner";

export default async function RunPage({
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

  const [byBank, { data: answers }] = await Promise.all([
    getBanks(supabase),
    supabase.from("answers").select("*").eq("test_id", id),
  ]);

  const steps = buildSteps(byBank);
  const startIndex = resumeIndex(steps, (answers ?? []) as Answer[]);

  // Pré-embaralha as opções e remove a marcação de correta antes de enviar ao cliente.
  const runnerSteps: RunnerStep[] = steps.map((s) => {
    const cfg = phaseConfig(s.phase);
    const q = shuffleStep(s, id);
    const phaseTotal = (byBank[cfg.bank] ?? []).length;
    return {
      phase: s.phase,
      phaseLabel: cfg.label,
      feedback: cfg.feedbackPerQuestion,
      indexInPhase: s.indexInPhase,
      phaseTotal,
      question: {
        id: q.id,
        context: q.context,
        image_key: q.image_key,
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
