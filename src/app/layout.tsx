import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Why did my bill change?",
  description:
    "Compare two monthly bill CSV exports and see exactly where the Total change came from.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="data:," />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/*
          Fonts come from a CDN with a system fallback in globals.css, so an
          offline build or browser still renders the page in fallback faces.
        */}
        <meta name="theme-color" content="#f5f6f7" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400..700&family=JetBrains+Mono:wght@400;500;600&display=swap"
        />
      </head>
      <body>
        <a className="skip-link" href="#main">
          Skip to content
        </a>

        <header className="topbar">
          <div className="wrap topbar-inner">
            <p className="wordmark">Why did my bill change?</p>
            <p className="topbar-meta">
              Amounts in Hong Kong dollars · Files are not stored
            </p>
          </div>
        </header>

        {children}
      </body>
    </html>
  );
}
