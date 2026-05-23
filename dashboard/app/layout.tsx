import type { Metadata } from "next";
import { Inter, Space_Grotesk, Instrument_Serif } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";

// 3 katmanli tipografi: DISPLAY (basliklar, sayilar) — Space Grotesk;
// BODY (tablo, form, etiket) — Inter; EDITORIAL VURGU (boş durum bayrakları,
// vurgulu kelimeler) — Instrument Serif italic. Tum uygulama bu üç fonta
// dayanir; CSS değişkenleri üzerinden kullanilir.
const inter = Inter({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-inter",
  display: "swap",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-display",
  display: "swap",
});

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: ["400"],
  style: ["italic", "normal"],
  variable: "--font-serif",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Deneyim Merkezi - Yönetim",
  description: "Rezervasyon yönetim paneli",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="tr"
      className={`${inter.variable} ${spaceGrotesk.variable} ${instrumentSerif.variable}`}
    >
      <body className="antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
