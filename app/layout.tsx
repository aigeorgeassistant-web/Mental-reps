import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "mental-reps",
  description: "Coaching platform — coach and client, one app.",
  manifest: "/manifest.json", // PWA manifest, see SPEC.md §3
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // No ClerkProvider needed — Better Auth doesn't require wrapping the
  // whole app in a client-side provider for basic session checks.
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
