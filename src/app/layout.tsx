import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Financeiro PF + PJ",
  description: "Finanças pessoais e da empresa no mesmo lugar, sem misturar.",
};

const LINKS = [
  { href: "/", rotulo: "Painel" },
  { href: "/importar", rotulo: "Importar" },
  { href: "/transacoes", rotulo: "Transações" },
  { href: "/contas", rotulo: "Contas" },
  { href: "/configuracoes", rotulo: "Configurações" },
];

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans">
        <header className="border-b border-borda bg-superficie">
          <nav className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 text-sm">
            <Link href="/" className="mr-3 font-semibold tracking-tight">
              <span className="text-pf">PF</span> + <span className="text-pj">PJ</span>
            </Link>
            {LINKS.map((l) => (
              <Link key={l.href} href={l.href} className="text-suave hover:text-foreground">
                {l.rotulo}
              </Link>
            ))}
          </nav>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
