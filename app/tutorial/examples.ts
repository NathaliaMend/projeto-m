import type { QuestionOption } from "@/lib/types";

/**
 * Conteúdo do tutorial guiado. É o arquivo para editar quando quiser mudar as
 * perguntas — nada aqui vem das planilhas nem do Supabase.
 *
 * DUAS COISAS IMPORTANTES:
 *
 * 1. NÃO EXISTE mp3 para estes textos, de propósito: enquanto as perguntas
 *    puderem mudar, gerar áudio na OpenAI é dinheiro jogado fora (o nome do
 *    arquivo sai do TEXTO — ver lib/audio.ts — então qualquer ajuste aqui
 *    invalidaria o mp3). Sem mp3, o app cai sozinho no TTS do navegador e o
 *    tutorial funciona. Quando as perguntas estiverem fechadas, rode
 *    `npm run gen-audio:openai` para o tutorial ganhar a mesma voz do teste.
 *
 * 2. O tutorial ensina só a MECÂNICA (ouvir, escolher, confirmar). As perguntas
 *    são literais de propósito: nenhuma é metáfora. Se o tutorial ensinasse a
 *    interpretar metáforas, ele viraria treino e contaminaria a linha de base.
 */

/**
 * PLACEHOLDER. Todas as imagens de /public/images são ilustrações de itens do
 * teste — não existe imagem "neutra" hoje. Esta é a do A210, o último item da
 * Fase C, que só é aplicada 2 semanas depois; é a que menos atrapalha.
 * Assim que houver uma imagem própria do tutorial, troque esta linha (e a
 * história do exemplo 1, que descreve esta cena).
 */
export const TUTORIAL_IMAGE = "faseA2/10.jpg";

export interface TutorialExample {
  id: string;
  /** O formato que este exemplo ensina. Aparece só para o aplicador. */
  teaches: string;
  /** Ilustração da tela de história. null = sem imagem. */
  image: string | null;
  /**
   * Texto falado da tela de contexto; null pula direto para a pergunta.
   * Quando há `phrases`, é este texto que é lido em voz alta (por isso ele
   * repete as frases, numeradas — igual à etapa 2 da Fase B).
   */
  context: string | null;
  /** Frases em linhas separadas, como na etapa 2 da Fase B. */
  phrases: string[] | null;
  question_text: string;
  options: QuestionOption[];
}

/** "Não tenho certeza" é sempre a última alternativa — como no teste real. */
const UNSURE: QuestionOption = {
  key: "d",
  text: "Não tenho certeza da resposta correta.",
  is_correct: false,
  is_fixed: true,
};

export const TUTORIAL_EXAMPLES: TutorialExample[] = [
  {
    id: "T1",
    teaches: "História com imagem",
    image: TUTORIAL_IMAGE,
    context:
      "Na escola, quatro amigos fizeram um cartaz juntos. Eles desenharam " +
      "um foguete, recortaram estrelas de papel e colaram tudo no cartaz.",
    phrases: null,
    question_text: "O que os amigos desenharam no cartaz?",
    options: [
      { key: "a", text: "Um foguete.", is_correct: true, is_fixed: false },
      { key: "b", text: "Um cachorro.", is_correct: false, is_fixed: false },
      { key: "c", text: "Uma casa.", is_correct: false, is_fixed: false },
      UNSURE,
    ],
  },
  {
    id: "T2",
    teaches: "Frases",
    image: null,
    context:
      "Frase 1: O sol brilha durante o dia. Frase 2: A lua aparece durante a noite.",
    phrases: ["O sol brilha durante o dia.", "A lua aparece durante a noite."],
    question_text: "Quando a lua aparece?",
    options: [
      { key: "a", text: "Durante a noite.", is_correct: true, is_fixed: false },
      { key: "b", text: "Durante o dia.", is_correct: false, is_fixed: false },
      {
        key: "c",
        text: "Na hora do almoço.",
        is_correct: false,
        is_fixed: false,
      },
      UNSURE,
    ],
  },
  {
    id: "T3",
    teaches: "Direto à pergunta",
    image: null,
    context: null,
    phrases: null,
    question_text: "De que cor é o céu num dia sem nuvens?",
    options: [
      { key: "a", text: "Azul.", is_correct: true, is_fixed: false },
      { key: "b", text: "Verde.", is_correct: false, is_fixed: false },
      { key: "c", text: "Vermelho.", is_correct: false, is_fixed: false },
      UNSURE,
    ],
  },
];
