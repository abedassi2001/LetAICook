import type { Metadata } from "next";
import { AppProviders } from "@/components/app-providers";
import { FirebaseAnalytics } from "@/components/firebase-analytics";
import { Geist, Geist_Mono } from "next/font/google";
import "@/styles/reactflow.css";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "letAIcook",
  description:
    "AI engineering coordination — roadmap, tasks, Jira, and Firebase demo.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased dark`}
    >
      <body className="flex min-h-full flex-col bg-app-bg text-app-text antialiased">
        <FirebaseAnalytics />
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
