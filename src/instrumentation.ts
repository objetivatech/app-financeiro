/** Ao subir o servidor, retoma importações que ficaram pela metade (ex.: após reiniciar o contêiner). */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || !process.env.DATABASE_URL) return;
  const { obterDb } = await import("./lib/db");
  const { retomarFila } = await import("./lib/importacao/fila");
  retomarFila(obterDb()).catch((erro) => console.error("Não foi possível retomar a fila de importação", erro));
}
