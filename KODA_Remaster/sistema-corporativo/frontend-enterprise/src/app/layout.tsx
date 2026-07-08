import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "SISTEMA DE GESTIÓN INTEGRAL",
  description: "Sistema de Gestión Institucional KODA Remaster",
  icons: {
    icon: [{ url: "/LogoGlass.webp", type: "image/png" }],
    shortcut: ["/LogoGlass.webp"],
    apple: ["/LogoGlass.webp"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body
        suppressHydrationWarning={true}
        className="antialiased"
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
