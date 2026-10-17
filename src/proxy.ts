import { NextResponse, type NextRequest } from "next/server";

/**
 * Segunda camada de proteção (a primeira é o Cloudflare Access): HTTP Basic Auth quando
 * APP_USUARIO e APP_SENHA estão definidos. Sem as variáveis, não bloqueia nada (útil em dev).
 */
export function proxy(request: NextRequest) {
  const usuario = process.env.APP_USUARIO;
  const senha = process.env.APP_SENHA;
  if (!usuario || !senha) return NextResponse.next();

  const cabecalho = request.headers.get("authorization") ?? "";
  if (cabecalho.startsWith("Basic ")) {
    const [u, ...resto] = atob(cabecalho.slice(6)).split(":");
    if (iguais(u, usuario) && iguais(resto.join(":"), senha)) return NextResponse.next();
  }
  return new NextResponse("Autenticação necessária.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="financeiro", charset="UTF-8"' },
  });
}

/** Comparação em tempo constante para não vazar a senha por tempo de resposta. */
function iguais(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diferenca = 0;
  for (let i = 0; i < a.length; i++) diferenca |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diferenca === 0;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
