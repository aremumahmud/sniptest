export const metadata = {
  title: 'Snip',
  description: 'A tiny URL shortener',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: 'system-ui, sans-serif',
          maxWidth: 720,
          margin: '0 auto',
          padding: '2rem 1rem',
          color: '#111',
        }}
      >
        {children}
      </body>
    </html>
  );
}
