"use client";

import { useRef } from "react";
import { Runner, type RunnerStep, type SubmitFn } from "./Runner";
import { phaseConfig } from "@/lib/phases";

/**
 * Roda o questionário SEM gravar nada: a correção acontece no cliente, a partir
 * de `correctKeys`. Usa o mesmo Runner da aplicação real, então o que aparece na
 * tela é o que a criança vê.
 *
 * Dois usos:
 *   - /preview  — demonstração, sem Supabase e sem login.
 *   - conferir uma etapa já concluída — o dado já está medido, e reaplicar
 *     sobrescreveria a medida (ver submitAnswer: is_correct é a PRIMEIRA
 *     tentativa e nunca é regravado).
 *
 * As tentativas ficam num ref (não em estado) porque só o `submit` as consulta —
 * mudá-las não deve re-renderizar. A regra de tentativas espelha a de
 * `submitAnswer` em app/tests/actions.ts; se uma mudar, mude a outra.
 */
export function LocalRunner({
  testId,
  studentName,
  steps,
  correctKeys,
  badge,
  exitHref,
  resultHref,
  resultLabel,
  doneMessage,
}: {
  testId: string;
  studentName: string;
  steps: RunnerStep[];
  /** question.id → key da alternativa correta. */
  correctKeys: Record<string, string>;
  badge?: string;
  exitHref?: string;
  resultHref?: string;
  resultLabel?: string;
  doneMessage?: string;
}) {
  const attemptsRef = useRef<Record<string, number>>({});

  const submit: SubmitFn = async ({ phase, questionId, selectedKey }) => {
    const correctKey = correctKeys[questionId] ?? null;
    const isCorrect = correctKey === selectedKey;
    const retriable = phaseConfig(phase).feedbackPerQuestion;

    // Fase B repete até acertar (sem teto); demais fases, 1 tentativa.
    const attempts = retriable ? (attemptsRef.current[questionId] ?? 0) + 1 : 1;
    attemptsRef.current[questionId] = attempts;

    const canRetry = retriable && !isCorrect;
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
      testId={testId}
      studentName={studentName}
      steps={steps}
      startIndex={0}
      submit={submit}
      exitHref={exitHref}
      resultHref={resultHref}
      resultLabel={resultLabel}
      doneMessage={doneMessage}
      demoBadge={badge}
    />
  );
}
