import type { Step } from "./assessment";
import { PHASES } from "./phases";
import type { Phase } from "./types";

/**
 * A ETAPA é a unidade de aplicação: o aplicador faz no máximo uma por dia, e
 * não emenda uma na outra. As 6 fases viram 9 etapas porque a Fase B é aplicada
 * uma metáfora por vez:
 *
 *   A(10) → A1B01(12) → A1B03(12) → A1B05(12) → AR1(10)
 *         → A1B07(12) → A1B09(12) → AR2(10) → C(10)   = 100
 *
 * CUIDADO COM O NOME: `etapa` já quer dizer outra coisa neste domínio —
 * `questions.etapa` é a subdivisão DENTRO da Fase B (1 Causalidade,
 * 2 Semelhança, 3 Compreensão), e `Step` (assessment.ts) é UMA pergunta. Por
 * isso aqui os identificadores são `Stage`/`stage`.
 */
export interface Stage {
  /**
   * "A" | "A1B01" | "A1B03" | "A1B05" | "AR1" | "A1B07" | "A1B09" | "AR2" | "C".
   *
   * Nas etapas de treino o id é o `parent_metaphor_code`. Ele coincide com o
   * `code` da pergunta da A1 que a etapa treina (a etapa "A1B01" treina a
   * metáfora da pergunta A1B01), mas são coisas diferentes: aquela pergunta é
   * aplicada nas etapas A/AR1/AR2, não na A1B01.
   */
  id: string;
  phase: Phase;
  /** `parent_metaphor_code` treinado — só nas etapas da Fase B. */
  metaphor: string | null;
  label: string;
}

/**
 * Derivado de PHASES, nunca escrito à mão: fase com `metaphors` vira uma etapa
 * por metáfora; as demais, uma etapa por fase. Mudou PHASES, as etapas
 * acompanham.
 */
export const STAGES: Stage[] = PHASES.flatMap((pc): Stage[] =>
  pc.metaphors
    ? pc.metaphors.map((code) => ({
        id: code,
        phase: pc.phase,
        metaphor: code,
        label: `Treino · ${code}`,
      }))
    : [{ id: pc.phase, phase: pc.phase, metaphor: null, label: pc.label }]
);

export const STAGE_IDS: string[] = STAGES.map((s) => s.id);

export function stageById(id: string): Stage | undefined {
  return STAGES.find((s) => s.id === id);
}

/**
 * A qual etapa um passo pertence. Todo item do banco B tem
 * `parent_metaphor_code`; em A1/A2 ele é sempre null — então a fase responde
 * pelas etapas que não são de treino.
 */
export function stageIdOf(step: Step): string {
  return step.question.parent_metaphor_code ?? step.phase;
}
