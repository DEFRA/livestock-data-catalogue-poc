export function renderPage(view) {
  return function showPage(req, res) {
    res.render(view)
  }
}
