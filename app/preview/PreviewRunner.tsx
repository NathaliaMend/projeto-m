"use client";

import { useRef } from "react";
import { Runner, type RunnerStep, type SubmitFn } from "@/app/tests/[id]/run/Runner";
import { MAX_ATTEMPTS_B } from "@/lib/config";
import { phaseConfig } from "@/lib/phases";

/**
 * Executa o questionário em modo demonstração: a correção acontece no cliente,
 * sem Supabase e sem salvar nada. Usa o mesmo componente Runner da avaliação real.
 *
 * As tentativas ficam num ref (não em estado) porque só o `submit` as consulta —
 * mudá-las não deve re-renderizar. A regra de tentativas espelha a de
 * `submitAnswer` em app/tests/actions.ts; se uma mudar, mude a outra.
 */
export function PreviewRunner({
  steps,
  correctKeys,
}: {
  steps: RunnerStep[];
  correctKeys: Record<string, string>;
}) {
  const attemptsRef = useRef<Record<string, number>>({});

  const submit: SubmitFn = async ({ phase, questionId, selectedKey }) => {
    const correctKey = correctKeys[questionId] ?? null;
    const isCorrect = correctKey === selectedKey;
    const retriable = phaseConfig(phase).feedbackPerQuestion;

    const attempts = Math.min(
      (attemptsRef.current[questionId] ?? 0) + 1,
      retriable ? MAX_ATTEMPTS_B : 1
    );
    attemptsRef.current[questionId] = attempts;

    const canRetry = retriable && !isCorrect && attempts < MAX_ATTEMPTS_B;
    return {
      isCorrect,
      attempts,
      canRetry,
      correctKey: canRetry ? null : correctKey,
      completed: false,
    };
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
