import { extrairComIa } from "../ia/extrator";
import { iaDisponivel } from "../ia/cliente";
import { decodificarTexto } from "./decodificar";
import { detectarFormato } from "./detectar";
import { parseCsv } from "./parsers/csv";
import { parseOfx } from "./parsers/ofx";
import { ErroImportacao, type ExtratoNormalizado } from "./tipos";

export interface OpcoesImportacao {
  /** Permite injetar outro extrator (útil em testes). */
  extratorIa?: typeof extrairComIa;
}

/**
 * Ponto de entrada da leitura de arquivos: detecta o formato, usa o parser determinístico
 * quando possível e recorre à IA para PDF, imagem e CSV com layout desconhecido.
 */
export async function lerArquivo(
  bytes: Uint8Array,
  nomeArquivo: string,
  opcoes: OpcoesImportacao = {},
): Promise<ExtratoNormalizado> {
  const extrator = opcoes.extratorIa ?? extrairComIa;
  const exigirIa = (motivo: string) => {
    if (!opcoes.extratorIa && !iaDisponivel()) {
      throw new ErroImportacao(`${motivo} Configure ANTHROPIC_API_KEY para ler esse tipo de arquivo com IA.`);
    }
  };

  const { formato, mimeType, naoSuportado } = detectarFormato(bytes, nomeArquivo);
  if (naoSuportado) throw new ErroImportacao(naoSuportado);

  switch (formato) {
    case "ofx":
      return parseOfx(decodificarTexto(bytes));
    case "csv": {
      const texto = decodificarTexto(bytes);
      const { extrato } = parseCsv(texto, nomeArquivo);
      if (extrato && extrato.transacoes.length > 0) return extrato;
      exigirIa("Não reconheci as colunas deste CSV.");
      return extrator({ formato: "csv", bytes, mimeType, nomeArquivo, texto });
    }
    case "pdf":
    case "imagem":
      exigirIa(`Arquivos ${formato === "pdf" ? "PDF" : "de imagem"} são lidos pela IA.`);
      return extrator({ formato, bytes, mimeType, nomeArquivo });
    default:
      throw new ErroImportacao("Formato de arquivo não reconhecido.");
  }
}
