export type Bank = "A1" | "A2" | "B";

/**
 * A avaliação aplica a A1 três vezes, intercalada com o treino da Fase B:
 * A (base) → B1 → AR1 (reaplicação) → B2 → AR2 (reaplicação) → C.
 * Ver PHASES em ./phases.
 */
export type Phase = "A" | "B1" | "AR1" | "B2" | "AR2" | "C";
export type TestStatus = "in_progress" | "completed";

export interface QuestionOption {
  key: string; // original letter from the source document (a/b/c/d)
  text: string;
  is_correct: boolean;
  is_fixed: boolean; // the "Não tenho certeza da resposta correta" option
}

export interface Question {
  id: string;
  code: string; // chave natural estável: "A1B01", "A1B01-E2-EQ3"
  bank: Bank;
  metaphor_number: number;
  parent_metaphor_code: string | null; // só no banco B: a metáfora da A1 que este item treina
  etapa: number | null; // só no banco B: 1 Causalidade, 2 Semelhança, 3 Compreensão
  etapa_label: string | null;
  step: string | null;
  order_index: number;
  metaphor: string | null;
  context: string | null; // história / frases de contexto (é o texto que vira áudio)
  phrases: string[] | null; // etapa 2 da B: as frases separadas, para exibir em linhas
  image_key: string | null; // ex.: "faseA/01.jpg" (relativo a /images)
  question_text: string;
  options: QuestionOption[];
}

export interface Student {
  id: string;
  applicator_id: string;
  name: string;
  birth_date: string | null;
  created_at: string;
}

export interface Test {
  id: string;
  applicator_id: string;
  /** O aluno avaliado. Um aluno pode ter vários testes (reaplicações). */
  student_id: string;
  status: TestStatus;
  /**
   * Em qual ETAPA o teste parou — um `Stage["id"]` (ver lib/stages.ts).
   * É `string` e não uma union porque STAGES é derivado de PHASES em runtime.
   * Cache derivado de `answers`; a fonte de verdade é sempre `answers`.
   */
  current_stage: string;
  started_at: string;
  completed_at: string | null;
  created_at: string;
}

/** Teste com o aluno embutido (join students) — para as telas que mostram o nome. */
export interface TestWithStudent extends Test {
  student: { name: string; birth_date: string | null } | null;
}

/**
 * A pergunta como a criança VIU, gravada junto da resposta.
 *
 * Não é cópia redundante do banco de perguntas. O que a criança viu é
 * DERIVADO: a ordem das alternativas sai de `shuffleOptions(optionSeed(...))` e
 * a condição sem suporte contextual sai de `orderSeed(...)` — ambos semeados
 * pelo `test_id`. E o seed reescreve `questions` por `code`, no lugar. Sem esta
 * foto, mexer no sorteio ou corrigir uma planilha muda em silêncio o
 * significado de respostas já coletadas.
 */
export interface PresentedQuestion {
  code: string; // mantém a linha legível mesmo se a pergunta for apagada
  metaphor: string | null;
  parent_metaphor_code: string | null;
  etapa: number | null;
  etapa_label: string | null;
  question_text: string;
  /** As alternativas NA ORDEM em que apareceram na tela. */
  options: QuestionOption[];
  /** O que estava na tela — null quando não foi mostrado. */
  context: string | null;
  phrases: string[] | null;
  image_key: string | null;
  /**
   * A condição experimental. Distingue "a história foi escondida pela condição
   * sem suporte contextual" de "esta pergunta nunca teve história" — os dois
   * chegam aqui como `context: null`.
   */
  hide_context: boolean;
}

export interface Answer {
  id: string;
  test_id: string;
  phase: Phase;
  question_id: string;
  presented: PresentedQuestion; // a foto do momento da aplicação
  selected_key: string; // a PRIMEIRA escolha
  selected_keys: string[] | null; // todas as escolhas, em ordem
  is_correct: boolean; // acertou na PRIMEIRA tentativa — é esta a medida de compreensão
  solved: boolean; // chegou na correta dentro do limite de tentativas
  attempts: number; // 1..3 (fora da Fase B é sempre 1)
  answered_at: string;
}
