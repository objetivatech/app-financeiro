/**
 * Roda uma vez quando o servidor sobe:
 * - retoma importações que ficaram pela metade (ex.: após reiniciar o contêiner);
 * - agenda a sincronização automática do Asaas (1 minuto após subir e depois a cada 6 horas).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || !process.env.DATABASE_URL) return;
  const { obterDb } = await import("./lib/db");
  const { retomarFila } = await import("./lib/importacao/fila");
  retomarFila(obterDb()).catch((erro) => console.error("Não foi possível retomar a fila de importação", erro));

  // Uma sincronização interrompida pelo reinício não está mais rodando.
  const { integracoes } = await import("./lib/db/schema");
  const { eq } = await import("drizzle-orm");
  await obterDb()
    .update(integracoes)
    .set({ status: "erro", mensagem: "Sincronização interrompida (o servidor reiniciou)." })
    .where(eq(integracoes.status, "sincronizando"))
    .catch(() => undefined);

  if (process.env.ASAAS_API_KEY && process.env.ASAAS_SINCRONIZACAO_AUTOMATICA !== "0") {
    const { sincronizarAsaas } = await import("./lib/integracoes/asaas/sincronizar");
    const rodar = () =>
      sincronizarAsaas(obterDb())
        .then((r) => console.log(`Asaas sincronizado: ${r.cobrancas} cobranças, ${r.lancamentosNovos} lançamentos novos`))
        .catch((erro) => console.error("Sincronização automática do Asaas falhou:", erro instanceof Error ? erro.message : erro));
    setTimeout(rodar, 60_000).unref();
    setInterval(rodar, 6 * 60 * 60_000).unref();
  }

  if (process.env.MERCADOPAGO_ACCESS_TOKEN && process.env.MERCADOPAGO_SINCRONIZACAO_AUTOMATICA !== "0") {
    const { sincronizarMercadoPago } = await import("./lib/integracoes/mercadopago/sincronizar");
    const rodarMp = () =>
      sincronizarMercadoPago(obterDb())
        .then((r) => console.log(`Mercado Pago sincronizado: ${r.pagamentos} pagamentos, ${r.lancamentosNovos} lançamentos novos`))
        .catch((erro) => console.error("Sincronização automática do Mercado Pago falhou:", erro instanceof Error ? erro.message : erro));
    setTimeout(rodarMp, 90_000).unref();
    setInterval(rodarMp, 6 * 60 * 60_000).unref();
  }

  // Inteligência interna: revisa os avisos a cada hora e, uma vez por semana, a IA escreve a carta
  // da semana (se houver chave da Anthropic; CARTA_SEMANAL=0 desliga a carta).
  const { atualizarAlertas } = await import("./lib/consultor/alertas");
  const revisar = async () => {
    await atualizarAlertas(obterDb()).catch((erro) => console.error("Falha ao atualizar avisos", erro));
    if (process.env.CARTA_SEMANAL !== "0" && (process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN)) {
      const { cartaSemanalSeNecessario } = await import("./lib/consultor/carta");
      await cartaSemanalSeNecessario(obterDb()).catch((erro) => console.error("Falha ao gerar a carta da semana", erro));
    }
  };
  setTimeout(revisar, 5 * 60_000).unref();
  setInterval(revisar, 60 * 60_000).unref();

  // Bot do Telegram (TELEGRAM_BOT_TOKEN): consultas, envio de extratos e avisos no celular.
  if (process.env.TELEGRAM_BOT_TOKEN) {
    const { iniciarBot } = await import("./lib/telegram/bot");
    iniciarBot(obterDb());
  }
}
