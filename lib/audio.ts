function fnv(str: string, seed: number): number {
  let h = seed >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function slugify(text: string): string {
  return normalize(text)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

/**
 * ID legível: slug do texto + 8 hex do hash para unicidade.
 * Ex: "maria-estava-com-muito-medo-de-tentar-ficar-em-pe-7b1c9f04"
 * Textos idênticos produzem o mesmo nome (um arquivo por texto).
 *
 * O slug tem só os 50 primeiros caracteres, então quem garante a unicidade é o
 * hash. Eram 4 hex (65 mil valores): com ~340 textos a chance de dois caírem no
 * mesmo nome já passava de 50% pelo paradoxo do aniversário — e uma colisão faz
 * duas perguntas dividirem o mesmo áudio, sem erro nenhum. 8 hex derruba isso
 * para desprezível.
 *
 * ATENÇÃO: o nome do arquivo é derivado do TEXTO. Mudar o texto de uma pergunta
 * aponta para um mp3 que não existe, e o app cai calado no TTS do navegador.
 * Depois de mexer em data/questions.json, rode `npm run gen-audio:openai`.
 */
export function audioId(text: string): string {
  const norm = normalize(text);
  const h = fnv(norm, 0x811c9dc5) ^ fnv(norm.split("").reverse().join(""), 0x01000193);
  return `${slugify(text)}-${h.toString(16).padStart(8, "0")}`;
}

/** Nome do OBJETO no Storage: `audio/<id>.mp3`, dentro do bucket question-media. */
export function audioObjectPath(text: string): string {
  return `audio/${audioId(text)}.mp3`;
}

/**
 * URL do mp3 pré-gerado. Os áudios vivem no Storage público (bucket
 * question-media), então a URL é montada a partir de NEXT_PUBLIC_SUPABASE_URL.
 * Sem essa variável (ex.: /preview e dev local sem Supabase), cai para o arquivo
 * estático em /public/audio — o playback em speech.tsx já cai no TTS do
 * navegador se a URL não resolver.
 */
export function audioSrc(text: string): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return `/audio/${audioId(text)}.mp3`;
  return `${base}/storage/v1/object/public/question-media/${audioObjectPath(text)}`;
}
