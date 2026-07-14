"use client";

import { Runner, type RunnerStep, type SubmitFn } from "@/app/tests/[id]/run/Runner";

/**
 * Executa o questionário em modo demonstração: a correção acontece no cliente,
 * sem Supabase e sem salvar nada. Usa o mesmo componente Runner da avaliação real.
 */
export function PreviewRunner({
  steps,
  correctKeys,
}: {
  steps: RunnerStep[];
  correctKeys: Record<string, string>;
}) {
  const submit: SubmitFn = async ({ questionId, selectedKey }) => {
    const isCorrect = correctKeys[questionId] === selectedKey;
    return { isCorrect, completed: false };
  };

  return (
    <Runner
      testId="preview"
      studentName="Visitante"
      steps={steps}
      startIndex={0}
      submit={submit}
      exitHref="/preview"
      resultHref="/preview"
      resultLabel="Voltar ao início"
      demoBadge="Modo demonstração · nada é salvo"
    />
  );
}
