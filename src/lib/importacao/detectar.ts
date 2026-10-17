import type { FormatoArquivo } from "./tipos";

export interface FormatoDetectado {
  formato: FormatoArquivo;
  mimeType: string;
  /** Motivo quando o formato é reconhecido mas ainda não suportado (ex.: XLSX, HEIC). */
  naoSuportado?: string;
}

function comeca(bytes: Uint8Array, assinatura: number[], deslocamento = 0): boolean {
  return assinatura.every((b, i) => bytes[deslocamento + i] === b);
}

/** Identifica o formato pelo conteúdo (assinatura dos bytes) e, em último caso, pela extensão. */
export function detectarFormato(bytes: Uint8Array, nomeArquivo: string): FormatoDetectado {
  const ext = nomeArquivo.toLowerCase().split(".").pop() ?? "";

  if (comeca(bytes, [0x25, 0x50, 0x44, 0x46])) return { formato: "pdf", mimeType: "application/pdf" };
  if (comeca(bytes, [0x89, 0x50, 0x4e, 0x47])) return { formato: "imagem", mimeType: "image/png" };
  if (comeca(bytes, [0xff, 0xd8, 0xff])) return { formato: "imagem", mimeType: "image/jpeg" };
  if (comeca(bytes, [0x47, 0x49, 0x46, 0x38])) return { formato: "imagem", mimeType: "image/gif" };
  if (comeca(bytes, [0x52, 0x49, 0x46, 0x46]) && comeca(bytes, [0x57, 0x45, 0x42, 0x50], 8)) {
    return { formato: "imagem", mimeType: "image/webp" };
  }
  if (comeca(bytes, [0x66, 0x74, 0x79, 0x70], 4) && /heic|heif/.test(ext)) {
    return {
      formato: "desconhecido",
      mimeType: "image/heic",
      naoSuportado: "Fotos HEIC (padrão do iPhone) ainda não são aceitas. Exporte como JPG ou PNG.",
    };
  }
  if (comeca(bytes, [0x50, 0x4b, 0x03, 0x04])) {
    return {
      formato: "desconhecido",
      mimeType: "application/zip",
      naoSuportado: ext === "xlsx" || ext === "xls"
        ? "Planilhas Excel ainda não são aceitas. Salve como CSV no Excel/Sheets e importe de novo."
        : "Arquivos compactados não são aceitos. Extraia e importe os arquivos individualmente.",
    };
  }

  // Texto: OFX ou CSV.
  const inicio = new TextDecoder("latin1").decode(bytes.slice(0, 2000));
  if (/OFXHEADER|<OFX>/i.test(inicio) || ext === "ofx" || ext === "qfx") {
    return { formato: "ofx", mimeType: "application/x-ofx" };
  }
  if (ext === "csv" || ext === "txt" || /[;,\t].*\n.*[;,\t]/.test(inicio)) {
    return { formato: "csv", mimeType: "text/csv" };
  }
  return { formato: "desconhecido", mimeType: "application/octet-stream", naoSuportado: "Formato de arquivo não reconhecido." };
}
