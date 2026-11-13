import "./globals.css";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "BVIMR - Internal Assessment & Attendance Portal",
  description: "Internal Assessment marks & attendance management portal for college departments",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900 font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
