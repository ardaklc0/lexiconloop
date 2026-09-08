import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
    title: "Lexicon Loop",
    description: "A calmer way to remember the words that matter.",
    manifest: "/manifest.webmanifest",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
    return (
        <html lang="en">
            <body>{children}</body>
        </html>
    );
}
