import { Marked, type Tokens } from "marked";

const escapar = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * Markdown → HTML para textos gerados pela IA (respostas do consultor, carta semanal).
 * Seguro por construção: HTML cru do texto vira texto; links só http(s), mailto e caminhos do
 * próprio app; imagens viram o texto alternativo.
 */
const md = new Marked({
  gfm: true,
  breaks: true,
  renderer: {
    html(token: Tokens.HTML | Tokens.Tag) {
      return escapar(token.text);
    },
    link(token: Tokens.Link) {
      const texto = this.parser.parseInline(token.tokens);
      const permitido = /^(https?:\/\/|mailto:|\/(?!\/)|#)/i.test(token.href);
      if (!permitido) return texto;
      const externo = /^https?:/i.test(token.href);
      return `<a href="${escapar(token.href)}"${externo ? ' target="_blank" rel="noopener noreferrer"' : ""}>${texto}</a>`;
    },
    image(token: Tokens.Image) {
      return escapar(token.text);
    },
  },
});

export function markdownSeguro(texto: string): string {
  return md.parse(texto, { async: false });
}
