/**
 * Síntese de fala (OpenAI TTS) — SÓ no servidor. É importado apenas por
 * app/questions/actions.ts (server action "Regerar áudio") e lê OPENAI_API_KEY
 * (sem prefixo NEXT_PUBLIC_, então nunca vai para o cliente).
 *
 * As constantes de voz/modelo/instruções DEVEM bater com scripts/gen-audio-openai.mjs
 * — se divergirem, um áudio regerado pelo botão soa diferente do gerado pelo
 * script. (O nome do arquivo, esse sim, é o audioId de lib/audio.ts.)
 */
const VOICE = process.env.OPENAI_TTS_VOICE || "coral";
const MODEL = process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts";
const INSTRUCTIONS =
  process.env.OPENAI_TTS_INSTRUCTIONS ||
  "Fale em português do Brasil, com tom caloroso, amigável e claro, " +
    "como quem conta uma história para uma criança. Ritmo calmo e boa dicção.";

/** Gera o mp3 de `text`. Lança se faltar a chave ou a API falhar. */
export async function ttsToMp3(text: string): Promise<Buffer> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY ausente no servidor — necessária para gerar áudio."
    );
  }

  const res = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      voice: VOICE,
      input: text,
      response_format: "mp3",
      instructions: INSTRUCTIONS,
    }),
  });

  if (!res.ok) {
    throw new Error(`OpenAI TTS HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  return Buffer.from(await res.arrayBuffer());
}
