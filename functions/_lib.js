export const json = (o, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
export const str = (v, n) => (typeof v === "string" ? v.trim().slice(0, n) : "");
export const isEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
export async function readJson(request, max) {
  const raw = await request.text();
  if (raw.length > max) return null;
  try { return JSON.parse(raw); } catch { return null; }
}
export const id = () => crypto.randomUUID();
