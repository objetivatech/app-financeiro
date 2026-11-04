"use server";

import { revalidatePath } from "next/cache";
import { obterDb } from "@/lib/db";
import { asaasConfigurado } from "@/lib/integracoes/asaas/cliente";
import { asaasSincronizando, sincronizarAsaas } from "@/lib/integracoes/asaas/sincronizar";

/** Dispara a sincronização em segundo plano (a primeira pode levar alguns minutos) e volta na hora. */
export async function sincronizarAsaasAgora(): Promise<{ erro?: string } | null> {
  if (!asaasConfigurado()) return { erro: "Configure ASAAS_API_KEY no .env do servidor." };
  if (asaasSincronizando()) return { erro: "Já está sincronizando." };
  void sincronizarAsaas(obterDb()).catch((erro) => console.error("Sincronização do Asaas falhou", erro));
  // Dá tempo de o status mudar para "sincronizando" antes de a página recarregar.
  await new Promise((r) => setTimeout(r, 300));
  revalidatePath("/integracoes");
  return null;
}

export async function sincronizarMercadoPagoAgora(): Promise<{ erro?: string } | null> {
  const { mercadoPagoConfigurado } = await import("@/lib/integracoes/mercadopago/cliente");
  const { mercadoPagoSincronizando, sincronizarMercadoPago } = await import("@/lib/integracoes/mercadopago/sincronizar");
  if (!mercadoPagoConfigurado()) return { erro: "Configure MERCADOPAGO_ACCESS_TOKEN no .env do servidor." };
  if (mercadoPagoSincronizando()) return { erro: "Já está sincronizando." };
  void sincronizarMercadoPago(obterDb()).catch((erro) => console.error("Sincronização do Mercado Pago falhou", erro));
  await new Promise((r) => setTimeout(r, 300));
  revalidatePath("/integracoes");
  return null;
}
