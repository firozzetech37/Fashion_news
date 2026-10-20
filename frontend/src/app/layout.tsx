import type { Metadata, Viewport } from "next";
import { Anton, Inter, Playfair_Display } from "next/font/google";
import "./globals.css";
import { Navbar } from "@/components/navigation/navbar";
import { Footer } from "@/components/navigation/footer";
import { Suspense } from "react";
import { AskLauncher } from "@/components/assistant/ask-launcher";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
});

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-serif",
});

// Condensed display face for the editorial home hero and numbered section marks
const anton = Anton({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-display",
});

const description = "Discover what's trending before it becomes mainstream. AI fashion intelligence from fashion, celebrity culture, brands and global media.";

export const metadata: Metadata = {
  title: {
    default: "TrendScope | AI Fashion Intelligence",
    template: "%s | TrendScope",
  },
  description,
  applicationName: "TrendScope",
  openGraph: {
    siteName: "TrendScope",
    title: "TrendScope | AI Fashion Intelligence",
    description,
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body
        className={`${inter.variable} ${playfair.variable} ${anton.variable} font-sans antialiased min-h-screen flex flex-col bg-background text-foreground`}
      >
        <Navbar />
        <main className="flex-1 flex flex-col">
          {children}
        </main>
        <Footer />
        {/* usePathname inside can suspend on dynamic routes */}
        <Suspense fallback={null}>
          <AskLauncher />
        </Suspense>
      </body>
    </html>
  );
}
