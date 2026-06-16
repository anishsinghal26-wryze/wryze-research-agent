import "./globals.css";

export const metadata = {
  title: "Wryze.ai Research Agent",
  description: "Milestone 1 — SAT topic research",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
