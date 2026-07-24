import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  // 303 (See Other), não o 307 padrão do NextResponse.redirect: este handler
  // responde a um POST (o form de "Sair"), e o 307 preservaria o método —
  // o navegador refaria um POST em /login, que é uma página GET, e a Vercel
  // devolveria 405. O 303 força o follow-up a virar GET.
  return NextResponse.redirect(new URL("/login", request.url), 303);
}
