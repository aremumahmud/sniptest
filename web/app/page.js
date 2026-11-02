import { listLinks } from './lib/api';
import { createLinkAction } from './actions';
import Link from 'next/link';

// SSR: fetch the link list on each request.
export const dynamic = 'force-dynamic';

export default async function HomePage() {
  let links = [];
  let loadError = null;
  try {
    const data = await listLinks();
    links = data.links;
  } catch (err) {
    loadError = err.message;
  }

  return (
    <main>
      <h1>✂️ Snip</h1>
      <p>Shorten a URL and track its clicks.</p>

      <form action={createLinkAction} style={{ display: 'flex', gap: 8 }}>
        <input
          name="url"
          type="url"
          required
          placeholder="https://example.com/very/long/link"
          style={{ flex: 1, padding: '0.5rem' }}
        />
        <button type="submit" style={{ padding: '0.5rem 1rem' }}>
          Snip
        </button>
      </form>

      <h2 style={{ marginTop: '2rem' }}>Recent links</h2>
      {loadError && <p style={{ color: 'crimson' }}>Error: {loadError}</p>}
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {links.map((l) => (
          <li
            key={l.id}
            style={{
              borderBottom: '1px solid #eee',
              padding: '0.75rem 0',
              display: 'flex',
              justifyContent: 'space-between',
              gap: 12,
            }}
          >
            <div style={{ overflow: 'hidden' }}>
              <a href={l.shortUrl}>{l.shortUrl}</a>
              <div
                style={{
                  color: '#666',
                  fontSize: 13,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                → {l.target_url}
              </div>
            </div>
            <Link href={`/links/${l.id}`}>stats</Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
