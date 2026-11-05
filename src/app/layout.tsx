import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { Footer } from "@/components/Footer";
import { LanguageProvider } from "@/components/LanguageProvider";

const geistSans = localFont({
  src: "./fonts/geist-latin.woff2",
  weight: "100 900",
  variable: "--font-geist-sans",
});

const geistMono = localFont({
  src: "./fonts/geist-mono-latin.woff2",
  weight: "100 900",
  variable: "--font-geist-mono",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://utlegg.aparent.tv"),
  title: "Aparent Utlegg",
  openGraph: {
    title: "Aparent Utlegg",
    description: "Last opp og send inn utlegg til produsent",
    siteName: "Aparent Utlegg",
    type: "website",
    locale: "nb_NO",
    images: [{ url: "/aparent-utlegg-share.png", width: 1200, height: 630, alt: "Aparent – hvit logo på svart bakgrunn" }],
  },
  twitter: { card: "summary_large_image", title: "Aparent Utlegg", images: ["/aparent-utlegg-share.png"] },
  description: "Last opp og send inn utlegg til produsent",
  icons: {
    icon: "/favicon.ico",
    apple: "/phone_home.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="nb">
      <body
        className={`${geistSans.variable} ${geistMono.variable} flex min-h-screen flex-col antialiased`}
      >
        <LanguageProvider><div className="min-h-0 flex-1">{children}</div>
        <Footer />
        </LanguageProvider>
      </body>
    </html>
  );
}
