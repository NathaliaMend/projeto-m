import type { Metadata } from "next";
import { Nunito } from "next/font/google";
import "./globals.css";

const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin"],
  weight: ["400", "600", "700", "800", "900"],
});

export const metadata: Metadata = {
  title: "Avaliação de Compreensão",
  description:
    "Questionário de compreensão de metáforas para crianças (fases A, B e C).",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className={`${nunito.variable} h-full antialiased`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
