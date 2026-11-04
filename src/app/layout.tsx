import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { Menu, MenuCelular } from "@/components/menu";
import { version } from "../../package.json";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Financeiro PF + PJ",
  description: "Finanças pessoais e da empresa no mesmo lugar, sem misturar.",
};

function Marca() {
  return (
    <Link href="/" className="font-semibold tracking-tight">
      <span className="text-pf">PF</span> + <span className="text-pj">PJ</span>
    </Link>
  );
}

function Versao() {
  return (
    <Link href="/ajuda#novidades" className="text-xs text-suave hover:text-foreground" title="Versão instalada: veja as novidades">
      v{version}
    </Link>
  );
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">
        <div className="mx-auto flex min-h-screen max-w-7xl flex-col md:flex-row">
          {/* Celular: menu recolhível no topo */}
          <header className="border-b border-borda bg-superficie md:hidden">
            <MenuCelular marca={<Marca />} rodape={<Versao />} />
          </header>
          {/* Computador: barra lateral fixa */}
          <aside className="hidden w-56 shrink-0 border-r border-borda bg-superficie md:block">
            <div className="sticky top-0 flex max-h-screen flex-col gap-5 overflow-y-auto px-3 py-4">
              <div className="flex items-baseline justify-between px-2">
                <Marca />
                <Versao />
              </div>
              <Menu />
            </div>
          </aside>
          <main className="min-w-0 flex-1 px-4 py-6 md:px-8">{children}</main>
        </div>
      </body>
    </html>
  );
}
