import type { Step } from "./assessment";
import { PHASES } from "./phases";
import type { Phase } from "./types";

/**
 * A ETAPA é a unidade de aplicação: o aplicador faz no máximo uma por dia, e
 * não emenda uma na outra. As 6 fases viram 19 etapas porque a Fase B é aplicada
 * uma SUB-ETAPA de cada metáfora por vez (Causalidade → Semelhança →
 * Compreensão):
 *
 *   A(10)
 *   → A1B01-E1(4) A1B01-E2(4) A1B01-E3(4)
 *   → A1B03-E1(4) A1B03-E2(4) A1B03-E3(4)
 *   → A1B05-E1(4) A1B05-E2(4) A1B05-E3(4)
 *   → AR1(10)
 *   → A1B07-E1(4) A1B07-E2(4) A1B07-E3(4)
 *   → A1B09-E1(4) A1B09-E2(4) A1B09-E3(4)
 *   → AR2(10) → C(10)   = 100
 *
 * CUIDADO COM O NOME: `etapa` já quer dizer duas coisas neste domínio —
 * `questions.etapa` é a subdivisão DENTRO da Fase B (1 Causalidade,
 * 2 Semelhança, 3 Compreensão), e `Step` (assessment.ts) é UMA pergunta. Por
 * isso aqui os identificadores são `Stage`/`stage`. Na Fase B o `Stage`
 * corresponde justamente a uma `questions.etapa` de uma metáfora.
 */
export interface Stage {
  /**
   * "A" | "AR1" | "AR2" | "C" nas fases sem treino; nas de treino é
   * `${parent_metaphor_code}-E${etapa}` — ex.: "A1B01-E1", "A1B01-E2".
   */
  id: string;
  phase: Phase;
  /** `parent_metaphor_code` treinado — só nas etapas da Fase B. */
  metaphor: string | null;
  /** Sub-etapa da Fase B (1 Causalidade, 2 Semelhança, 3 Compreensão). */
  etapa: number | null;
  label: string;
}

/**
 * As 3 sub-etapas de treino dentro de CADA metáfora da Fase B. É protocolo
 * fixo (Planejamento.xlsx / Planilha de itens Fase B.xlsx): toda metáfora tem
 * exatamente estas três, 4 perguntas cada. Os rótulos batem com
 * `questions.etapa_label` do banco — o banco continua sendo a fonte do texto
 * exibido pergunta a pergunta; aqui é só o nome da etapa no menu.
 */
export const FASE_B_ETAPAS: { etapa: number; label: string }[] = [
  { etapa: 1, label: "Causalidade" },
  { etapa: 2, label: "Semelhança" },
  { etapa: 3, label: "Compreensão" },
];

/** Id de etapa da Fase B a partir da metáfora e da sub-etapa. */
export function faseBStageId(metaphorCode: string, etapa: number): string {
  return `${metaphorCode}-E${etapa}`;
}

/**
 * Derivado de PHASES, nunca escrito à mão: fase com `metaphors` vira uma etapa
 * por (metáfora × sub-etapa); as demais, uma etapa por fase. Mudou PHASES, as
 * etapas acompanham.
 */
export const STAGES: Stage[] = PHASES.flatMap((pc): Stage[] =>
  pc.metaphors
    ? pc.metaphors.flatMap((code) =>
        FASE_B_ETAPAS.map((e) => ({
          id: faseBStageId(code, e.etapa),
          phase: pc.phase,
          metaphor: code,
          etapa: e.etapa,
          label: `Treino · ${code} · ${e.label}`,
        }))
      )
    : [{ id: pc.phase, phase: pc.phase, metaphor: null, etapa: null, label: pc.label }]
);

export const STAGE_IDS: string[] = STAGES.map((s) => s.id);

export function stageById(id: string): Stage | undefined {
  return STAGES.find((s) => s.id === id);
}

/**
 * A qual etapa um passo pertence. Todo item do banco B tem
 * `parent_metaphor_code` + `etapa`; em A1/A2 ambos são null — então a fase
 * responde pelas etapas que não são de treino.
 */
export function stageIdOf(step: Step): string {
  const q = step.question;
  if (q.parent_metaphor_code && q.etapa != null) {
    return faseBStageId(q.parent_metaphor_code, q.etapa);
  }
  return step.phase;
}
