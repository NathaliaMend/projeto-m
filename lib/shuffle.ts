import type { QuestionOption } from "./types";

/** Hash de string (FNV-1a) → uint32, para semear o PRNG. */
function hashString(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** PRNG determinístico (mulberry32). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Fisher–Yates **determinístico**: a mesma semente sempre dá a mesma ordem.
 * É o que permite embaralhar sem quebrar o "continuar de onde parou" — a ordem
 * é recalculada igual a cada carregamento em vez de ser guardada no banco.
 */
export function shuffleWithSeed<T>(items: readonly T[], seed: string): T[] {
  const rng = mulberry32(hashString(seed));
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Embaralha as alternativas, **mantendo "Não tenho certeza da resposta correta."
 * sempre por último**. Nas planilhas a correta vem quase sempre na primeira
 * alternativa, então sem embaralhar ela cairia sempre na mesma posição; já a
 * opção fixa é uma saída ("não sei"), não uma alternativa a mais — ela precisa
 * ficar no fim para a criança encontrar sempre no mesmo lugar.
 */
export function shuffleOptions(
  options: QuestionOption[],
  seed: string
): QuestionOption[] {
  const fixed = options.filter((o) => o.is_fixed);
  const rest = options.filter((o) => !o.is_fixed);
  return [...shuffleWithSeed(rest, seed), ...fixed];
}
