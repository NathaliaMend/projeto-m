import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

// No Next.js 16 o antigo `middleware` foi renomeado para `proxy` (runtime nodejs).
export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    // Aplica em tudo, exceto arquivos estáticos, imagens e favicon.
    "/((?!_next/static|_next/image|favicon.ico|images/|audio/|.*\\.(?:png|jpg|jpeg|svg|ico|mp3|m4a)$).*)",
  ],
};
