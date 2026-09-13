import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    // Arquivos estáticos de /public não passam pelo guard de sessão. Sem vídeo
    // e fonte nesta lista, o hero.mp4 virava 307 para /login no visitante
    // anônimo — o hero ficava sem vídeo em produção.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|mp4|webm|mov|m4v|mp3|wav|woff|woff2|ttf|otf)$).*)",
  ],
};
