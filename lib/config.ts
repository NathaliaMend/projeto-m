/** Constantes de ritmo e apresentação da avaliação. */

/** Tela em branco entre uma pergunta e outra. */
export const BLANK_SCREEN_MS = 1000;

/** Tentativas por pergunta na Fase B (nas demais fases é sempre 1). */
export const MAX_ATTEMPTS_B = 3;

/**
 * Emojis sorteados na tela de "Parabéns" da Fase B.
 * Provisório: quando o banco de imagens chegar, troque esta lista pelos
 * caminhos dos arquivos e ajuste o <span> em FeedbackScreen (Runner.tsx).
 */
export const FEEDBACK_EMOJIS = [
  "🎉", "⭐", "🚀", "🌟", "👏", "🏆", "✨", "🥳", "🎊", "💪", "🦄", "🌈",
];

/**
 * Trava de segurança do áudio: se o callback de fim não chegar (mp3 quebrado,
 * TTS do navegador falhando em silêncio), libera a tela assim mesmo. Sem isto,
 * uma falha de áudio prende a criança na tela para sempre.
 * Mesma heurística que o SpeakButton já usa para o estado "tocando".
 */
export function speechTimeoutMs(text: string): number {
  return Math.max(2000, text.length * 90);
}
