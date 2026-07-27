/**
 * Classifica o dispositivo onde a criança respondeu — para o pesquisador saber
 * se a resposta veio de um tablet ou de um notebook. Roda no cliente (usa
 * `navigator`); no servidor ou sem `navigator`, devolve "desconhecido".
 *
 * A detecção por user-agent nunca é 100%: o iPadOS se disfarça de Mac, e um
 * notebook com tela sensível ao toque existe. Por isso combinamos o user-agent
 * com `maxTouchPoints`. É uma pista, não uma prova — mas resolve os casos reais
 * (tablet Android/iPad vs. notebook Windows/Mac).
 */
export function detectDevice(): string {
  if (typeof navigator === "undefined") return "desconhecido";
  const ua = navigator.userAgent;
  const touch = (navigator.maxTouchPoints ?? 0) > 1;

  // Celular: iPhone, ou Android com "Mobile" no user-agent.
  if (/iPhone|iPod/.test(ua) || (/Android/.test(ua) && /Mobile/.test(ua))) {
    return "celular";
  }
  // Tablet: iPad (inclui o iPadOS que se anuncia como Macintosh com toque) e
  // Android sem "Mobile".
  if (
    /iPad/.test(ua) ||
    (/Android/.test(ua) && !/Mobile/.test(ua)) ||
    (/Macintosh/.test(ua) && touch)
  ) {
    return "tablet";
  }
  // Toque numa máquina que não se parece com desktop conhecido: provável tablet.
  if (touch && !/Windows NT|X11|Linux x86/.test(ua)) {
    return "tablet";
  }
  return "notebook";
}
