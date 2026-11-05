// CDP checks every service with GET /health. It only asks whether the
// container is alive, so it needs no sign-in and reads no data.
export function showHealth(req, res) {
  res.json({ message: 'success' })
}
