import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { textoDoPdf } from "../../ia/extrator";
import { cifrar, decifrar, ErroSenhaPdf, senhaDoPdf } from "../senha-pdf";

const fixture = (nome: string) => new Uint8Array(readFileSync(`tests/fixtures/${nome}`));

describe("PDF com senha", () => {
  it("PDF sem senha passa direto", async () => {
    expect(await senhaDoPdf(fixture("extrato-texto.pdf"))).toBeNull();
  });

  it("pede a senha, recusa a errada e acha a certa entre as guardadas", async () => {
    const pdf = fixture("extrato-com-senha.pdf");
    await expect(senhaDoPdf(pdf)).rejects.toMatchObject({ motivo: "pedir" });
    await expect(senhaDoPdf(pdf, { informada: "errada" })).rejects.toBeInstanceOf(ErroSenhaPdf);
    await expect(senhaDoPdf(pdf, { informada: "errada" })).rejects.toMatchObject({ motivo: "incorreta" });
    expect(await senhaDoPdf(pdf, { guardadas: ["outra", "s3nh@-teste"] })).toBe("s3nh@-teste");
  });

  it("com a senha, o texto sai no servidor (é só ele que vai para a IA)", async () => {
    const pdf = fixture("extrato-com-senha.pdf");
    expect(await textoDoPdf(pdf)).toBeNull();
    expect(await textoDoPdf(pdf, "s3nh@-teste")).toMatch(/Extrato Banco Exemplo/);
  });

  it("senhas guardadas ficam cifradas", () => {
    const c = cifrar("s3nh@-teste");
    expect(c).not.toContain("s3nh");
    expect(cifrar("s3nh@-teste")).not.toBe(c); // IV aleatório
    expect(decifrar(c)).toBe("s3nh@-teste");
    expect(decifrar("lixo")).toBeNull();
  });
});
