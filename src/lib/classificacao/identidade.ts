import type { Db } from "../db";
import { obterPerfilFiscal } from "../fiscal/perfil";
import { normalizarTexto } from "../importacao/util";
import { variantesDeNome, type Identidade } from "./motor";

/** Junta o que se sabe de você e da empresa: titulares dos extratos + o que você informou em Configurações. */
export async function obterIdentidade(db: Db): Promise<Identidade> {
  const [titulares, perfil] = await Promise.all([db.query.titulares.findMany(), obterPerfilFiscal(db)]);
  const id: Identidade = { docsSocio: new Set(), nomesSocio: [], docsEmpresa: new Set(), nomesEmpresa: [] };
  const nomesSocio = new Set<string>();
  const nomesEmpresa = new Set<string>();
  for (const t of titulares) {
    if (t.tipo === "PF") {
      if (t.documento) id.docsSocio.add(t.documento);
      if (t.nome && t.nome !== "Eu") nomesSocio.add(normalizarTexto(t.nome));
    } else {
      if (t.documento) id.docsEmpresa.add(t.documento);
      if (t.nome && t.nome !== "Minha empresa") nomesEmpresa.add(normalizarTexto(t.nome));
    }
  }
  if (perfil.nomeSocio.trim()) nomesSocio.add(normalizarTexto(perfil.nomeSocio));
  const cpf = perfil.cpfSocio.replace(/\D/g, "");
  if (cpf.length === 11) id.docsSocio.add(cpf);
  for (const n of perfil.nomesEmpresa) if (n.trim()) nomesEmpresa.add(normalizarTexto(n));
  // Nomes mais longos primeiro (casam antes das variações curtas).
  id.nomesSocio = [...new Set([...nomesSocio].flatMap(variantesDeNome))].sort((a, b) => b.length - a.length);
  id.nomesEmpresa = [...new Set([...nomesEmpresa].flatMap((n) => [n, ...variantesDeNome(n)]))].filter((n) => n.length >= 4).sort((a, b) => b.length - a.length);
  return id;
}
