import Link from "next/link";

/** Ícone "?" que leva à seção correspondente do manual. */
export function LinkAjuda({ secao }: { secao: string }) {
  return (
    <Link
      href={`/ajuda#${secao}`}
      title="Ajuda sobre esta tela"
      className="ml-1 inline-flex h-5 w-5 items-center justify-center rounded-full border border-borda align-middle text-xs font-normal text-suave hover:text-foreground"
    >
      ?
    </Link>
  );
}
