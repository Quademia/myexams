import type { Metadata } from "next";
import "./globals.css";
import { IdleTimeout } from "@/components/ui/IdleTimeout";

// This is the root layout — it wraps every page in the app.
// Think of it as the <html> and <body> tags that every page shares.
// The {children} prop is whatever page content gets rendered inside.

export const metadata: Metadata = {
  title: "QAcademy",
  description: "QAcademy Beta",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-gray-50 text-gray-900 font-sans">
        <IdleTimeout />
        {children}
      </body>
    </html>
  );
}
