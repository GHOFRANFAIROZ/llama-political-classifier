// app/layout.tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Anti Hate Dashboard",
  description: "Monitoring hate-speech activity",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-[#0F0F0F] text-gray-200 antialiased min-h-screen">
        {children}
      </body>
    </html>
  );
}