export async function health(req, res) {
  res.json({ ok: true, ts: new Date().toISOString() });
}
