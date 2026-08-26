import type { Metadata } from "next";
import { JetBrains_Mono, Outfit, Space_Grotesk } from "next/font/google";
import "./globals.css";

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
});

const space = Space_Grotesk({
  variable: "--font-space",
  subsets: ["latin"],
});

const jetbrains = JetBrains_Mono({
  variable: "--font-mono-jb",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "TrackMyAssignments",
  description: "Stay ahead of every deadline",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${outfit.variable} ${space.variable} ${jetbrains.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
