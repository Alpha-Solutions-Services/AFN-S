import type { Metadata } from "next";
import { UiProvider } from "@/components/ui/UiProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Alpha Sales Point — CRM",
  description: "AI-powered cold email CRM for Alpha Solutions",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <UiProvider>{children}</UiProvider>
      </body>
    </html>
  );
}
