// Server-side helper for talking to the Snip API.
const API = process.env.SNIP_API_URL || 'http://localhost:3001';

export async function createLink(url) {
  const res = await fetch(`${API}/links`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url }),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error((await res.json()).error || 'Failed to create');
  return res.json();
}

export async function listLinks() {
  const res = await fetch(`${API}/links`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to load links');
  return res.json();
}

export async function getStats(id) {
  const res = await fetch(`${API}/links/${id}/stats`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to load stats');
  return res.json();
}

export const apiBase = API;
