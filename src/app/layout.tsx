import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Give | Cancer Mukt Bharat Abhiyan",
  description: "Choose who or what you would like to support with a secure donation.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
