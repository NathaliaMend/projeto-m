import type { Bank, Phase } from "./types";

/**
 * A avaliação tem 6 fases, aplicadas em sequência (100 passos no total).
 *
 *   A    A1  10  linha de base: as 10 metáforas, sem feedback
 *   B1   B   36  treino das metáforas A1B01, A1B03, A1B05 (3 etapas × 4 perguntas)
 *   AR1  A1  10  reaplicação da A1 depois de A1B05
 *   B2   B   24  treino das metáforas A1B07, A1B09
 *   AR2  A1  10  reaplicação da A1 depois de A1B09
 *   C    A2  10  metáforas novas (banco A2)
 *
 * A, AR1 e AR2 usam o mesmo banco; o que separa as respostas é a chave
 * (test_id, phase, question_id) em `answers`. A semente de embaralhamento
 * inclui a fase, então cada aplicação sorteia uma ordem diferente.
 */
export interface PhaseConfig {
  phase: Phase;
  bank: Bank;
  /** Mostrar feedback "acertou/errou" e permitir novas tentativas (só a Fase B). */
  feedbackPerQuestion: boolean;
  /** Sortear a ordem das metáforas (semeado pelo teste — estável ao retomar). */
  randomize?: boolean;
  /**
   * Nas fases randomizadas, quantas metáforas do começo da ordem sorteada são
   * mostradas SEM história e SEM imagem (condição sem suporte contextual).
   */
  withoutContext?: number;
  /** Só na Fase B: quais metáforas da A1 esta parte treina (parent_metaphor_code). */
  metaphors?: string[];
  label: string;
}

export const PHASES: PhaseConfig[] = [
  {
    phase: "A",
    bank: "A1",
    feedbackPerQuestion: false,
    randomize: true,
    withoutContext: 5,
    label: "Fase A",
  },
  {
    phase: "B1",
    bank: "B",
    feedbackPerQuestion: true,
    metaphors: ["A1B01", "A1B03", "A1B05"],
    label: "Fase B — parte 1",
  },
  {
    phase: "AR1",
    bank: "A1",
    feedbackPerQuestion: false,
    randomize: true,
    withoutContext: 5,
    label: "Fase A — reaplicação 1",
  },
  {
    phase: "B2",
    bank: "B",
    feedbackPerQuestion: true,
    metaphors: ["A1B07", "A1B09"],
    label: "Fase B — parte 2",
  },
  {
    phase: "AR2",
    bank: "A1",
    feedbackPerQuestion: false,
    randomize: true,
    withoutContext: 5,
    label: "Fase A — reaplicação 2",
  },
  { phase: "C", bank: "A2", feedbackPerQuestion: false, label: "Fase C" },
];

export const PHASE_ORDER: Phase[] = PHASES.map((p) => p.phase);

export function phaseConfig(phase: Phase): PhaseConfig {
  const p = PHASES.find((x) => x.phase === phase);
  if (!p) throw new Error(`Fase desconhecida: ${phase}`);
  return p;
}
