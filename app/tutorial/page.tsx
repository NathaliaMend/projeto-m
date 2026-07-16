import { TutorialRunner } from "./TutorialRunner";

/**
 * Tutorial guiado, aplicado antes da Fase A. Não precisa de login nem de
 * Supabase: o conteúdo é fixo (app/tutorial/examples.ts) e nada é gravado —
 * o tutorial ensina a usar o app, não mede nada.
 */
export default function TutorialPage() {
  return <TutorialRunner />;
}
