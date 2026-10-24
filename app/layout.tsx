import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Saira, Saira_Condensed } from "next/font/google";
import "./globals.css";

// Saira Condensed: instrument-panel display face for titles and labels.
const display = Saira_Condensed({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "700", "800"],
});

// Saira: body copy on briefing cards.
const body = Saira({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

// IBM Plex Mono: flight readouts.
const data = IBM_Plex_Mono({
  variable: "--font-data",
  subsets: ["latin"],
  weight: ["500", "600"],
});

export const metadata: Metadata = {
  title: "Roadster",
  description: "Fly a thruster-equipped Roadster off the launch pad and land it softly on the target pad.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#070a17",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${data.variable}`}>
      <body>{children}</body>
    </html>
  );
}
