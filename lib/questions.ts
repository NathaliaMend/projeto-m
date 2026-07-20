import type { QuestionOption } from "./types";

/**
 * A alternativa fixa de "saída" — sempre a última e nunca a correta. O texto
 * precisa bater EXATAMENTE com o que o build gera (scripts/build_questions.py,
 * FIXED_OPTION), senão a checagem de `is_fixed` na edição não reconheceria.
 */
export const FIXED_OPTION = "Não tenho certeza da resposta correta.";

/**
 * Valida um conjunto de alternativas editadas, espelhando `build_options` do
 * scripts/build_questions.py (as mesmas invariantes que o build exige). Roda no
 * cliente (para desabilitar "Salvar") e no servidor (autoridade). Devolve a
 * primeira violação em pt-BR, ou null se está tudo certo.
 *
 * `original` é a versão vinda do banco: a edição só troca `text`/`is_correct`;
 * a quantidade, as `key`s e a posição da opção fixa NÃO podem mudar.
 */
export function validateOptions(
  options: QuestionOption[],
  original: QuestionOption[]
): string | null {
  if (options.length !== original.length) {
    return "O número de alternativas não pode mudar.";
  }

  // As `key`s (a/b/c/d) são a identidade usada em answers.selected_key — têm que
  // continuar as mesmas, na mesma ordem.
  for (let i = 0; i < options.length; i++) {
    if (options[i].key !== original[i].key) {
      return "As alternativas não podem ser reordenadas nem trocar de identificador.";
    }
    if (options[i].is_fixed !== original[i].is_fixed) {
      return "A alternativa de “não tenho certeza” não pode ser alterada de posição.";
    }
  }

  const correct = options.filter((o) => o.is_correct);
  if (correct.length !== 1) {
    return "Marque exatamente uma alternativa como correta.";
  }
  if (correct[0].is_fixed) {
    return "A alternativa de “não tenho certeza” não pode ser a correta.";
  }

  const fixed = options.filter((o) => o.is_fixed);
  if (fixed.length !== 1) {
    return "Deve haver exatamente uma alternativa de “não tenho certeza”.";
  }
  if (!options[options.length - 1].is_fixed) {
    return "A alternativa de “não tenho certeza” tem que ser a última.";
  }
  if (fixed[0].text.trim() !== FIXED_OPTION) {
    return "O texto da alternativa de “não tenho certeza” não pode ser alterado.";
  }

  for (const o of options) {
    if (!o.text.trim()) return "Nenhuma alternativa pode ficar em branco.";
  }

  return null;
}
