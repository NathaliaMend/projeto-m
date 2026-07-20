/**
 * Resolve o `src` da imagem de uma pergunta. Convivem duas origens:
 *   - imagens do import inicial, estáticas em /public/images (ex.: "faseA/01.jpg");
 *   - imagens enviadas pelo painel /questions, guardadas no Supabase Storage,
 *     cujo `image_key` é a URL pública completa (https://...).
 * A URL http é usada como está; o resto é caminho relativo a /images.
 */
export function imageSrc(imageKey: string): string {
  return /^https?:\/\//.test(imageKey) ? imageKey : `/images/${imageKey}`;
}
