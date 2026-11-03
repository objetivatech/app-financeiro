import iconv from "iconv-lite";

/**
 * Bancos brasileiros ainda exportam muito em Windows-1252/ISO-8859-1, e às vezes declaram
 * um charset diferente do real. Por isso ignoramos o declarado: tenta UTF-8 estrito
 * (texto 1252 com acentos quase nunca é UTF-8 válido) e, se falhar, usa Windows-1252.
 */
export function decodificarTexto(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^﻿/, "");
  } catch {
    return iconv.decode(Buffer.from(bytes), "win1252");
  }
}
