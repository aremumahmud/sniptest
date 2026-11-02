import { getStats } from '../../lib/api';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function StatsPage({ params }) {
  let stats = null;
  let error = null;
  try {
    stats = await getStats(params.id);
  } catch (err) {
    error = err.message;
  }

  if (error) {
    return (
      <main>
        <Link href="/">← back</Link>
        <p style={{ color: 'crimson' }}>Error: {error}</p>
      </main>
    );
  }

  const { link, totalClicks, daily } = stats;

  return (
    <main>
      <Link href="/">← back</Link>
      <h1>Stats for /{link.slug}</h1>
      <p style={{ color: '#666' }}>→ {link.target_url}</p>
      <p style={{ fontSize: 32, fontWeight: 700 }}>{totalClicks} clicks</p>

      <h2>By day</h2>
      {daily.length === 0 ? (
        <p>No clicks recorded yet.</p>
      ) : (
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>
                Day
              </th>
              <th
                style={{ textAlign: 'right', borderBottom: '1px solid #ccc' }}
              >
                Clicks
              </th>
            </tr>
          </thead>
          <tbody>
            {daily.map((d) => (
              <tr key={d.day}>
                <td style={{ padding: '4px 0' }}>
                  {new Date(d.day).toISOString().slice(0, 10)}
                </td>
                <td style={{ textAlign: 'right' }}>{d.clicks}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
