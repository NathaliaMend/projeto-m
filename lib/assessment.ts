import type { Answer, Phase, Question } from "./types";
import { PHASES } from "./phases";
import { shuffleOptions, shuffleWithSeed } from "./shuffle";

export interface Step {
  phase: Phase;
  indexInPhase: number;
  question: Question;
  /**
   * Passo da condição "sem suporte contextual": história e imagem não são
   * mostradas. Aplicado às primeiras metáforas da ordem sorteada nas fases A1.
   */
  hideContext: boolean;
}

/** Semente da ordem das metáforas de uma fase (estável por teste). */
function orderSeed(testId: string, phase: Phase): string {
  return `${testId}:${phase}:order`;
}

/**
 * Monta a lista linear de passos das 6 fases a partir dos bancos.
 * Precisa do `testId` porque a ordem das metáforas é sorteada por teste.
 */
export function buildSteps(
  byBank: Record<string, Question[]>,
  testId: string
): Step[] {
  const steps: Step[] = [];

  for (const pc of PHASES) {
    let qs = byBank[pc.bank] ?? [];

    // Fase B: cada parte treina só um subconjunto das metáforas da A1, e as
    // metáforas seguem a ordem declarada em PHASES (dentro de cada uma, o
    // order_index do banco já põe as etapas 1 → 2 → 3 na ordem certa).
    if (pc.metaphors) {
      qs = pc.metaphors.flatMap((code) =>
        qs.filter((q) => q.parent_metaphor_code === code)
      );
    }

    if (pc.randomize) qs = shuffleWithSeed(qs, orderSeed(testId, pc.phase));

    qs.forEach((question, indexInPhase) =>
      steps.push({
        phase: pc.phase,
        indexInPhase,
        question,
        hideContext: indexInPhase < (pc.withoutContext ?? 0),
      })
    );
  }

  return steps;
}

/**
 * Quantos passos a avaliação tem no total (100), sem precisar de um teste.
 * Sortear e filtrar não muda a contagem, então o dashboard usa isto para a
 * barra de progresso em vez de montar os passos de cada teste.
 */
export function totalSteps(byBank: Record<string, Question[]>): number {
  return PHASES.reduce((sum, pc) => {
    const qs = byBank[pc.bank] ?? [];
    if (!pc.metaphors) return sum + qs.length;
    const wanted = new Set(pc.metaphors);
    return (
      sum +
      qs.filter(
        (q) => q.parent_metaphor_code && wanted.has(q.parent_metaphor_code)
      ).length
    );
  }, 0);
}

/** Chave estável de embaralhamento por teste/fase/pergunta. */
export function optionSeed(
  testId: string,
  phase: Phase,
  questionId: string
): string {
  return `${testId}:${phase}:${questionId}`;
}

/**
 * Prepara a pergunta de um passo para exibição: embaralha as opções e, na
 * condição sem suporte contextual, remove história/frases/imagem.
 *
 * A remoção acontece **no servidor** — se fosse só esconder no cliente, o texto
 * da história viajaria no HTML e a condição experimental estaria comprometida
 * para quem abrisse o inspetor.
 */
export function shuffleStep(step: Step, testId: string): Question {
  const q = step.question;
  return {
    ...q,
    context: step.hideContext ? null : q.context,
    phrases: step.hideContext ? null : q.phrases,
    image_key: step.hideContext ? null : q.image_key,
    options: shuffleOptions(q.options, optionSeed(testId, step.phase, q.id)),
  };
}

/**
 * Primeiro passo ainda não respondido (ponto de retomada).
 * Retorna steps.length quando o teste está completo.
 */
export function resumeIndex(steps: Step[], answers: Answer[]): number {
  const answered = new Set(answers.map((a) => `${a.phase}:${a.question_id}`));
  for (let i = 0; i < steps.length; i++) {
    if (!answered.has(`${steps[i].phase}:${steps[i].question.id}`)) return i;
  }
  return steps.length;
}

/** Progresso derivado das respostas, para gravar em `tests`. */
export function progressFromAnswers(steps: Step[], answers: Answer[]) {
  const idx = resumeIndex(steps, answers);
  const completed = idx >= steps.length;
  const at = completed ? steps[steps.length - 1] : steps[idx];
  const currentPhase: Phase = at ? at.phase : "A";
  const currentIndex = at ? at.indexInPhase : 0;
  return { completed, currentPhase, currentIndex };
}
