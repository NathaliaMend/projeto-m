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

export interface Test {
  id: string;
  applicator_id: string;
  student_name: string;
  student_birth_date: string | null;
  status: TestStatus;
  current_phase: Phase;
  current_index: number;
  started_at: string;
  completed_at: string | null;
  created_at: string;
}

export interface Answer {
  id: string;
  test_id: string;
  phase: Phase;
  question_id: string;
  selected_key: string; // a PRIMEIRA escolha
  selected_keys: string[] | null; // todas as escolhas, em ordem
  is_correct: boolean; // acertou na PRIMEIRA tentativa — é esta a medida de compreensão
  solved: boolean; // chegou na correta dentro do limite de tentativas
  attempts: number; // 1..3 (fora da Fase B é sempre 1)
  answered_at: string;
}
