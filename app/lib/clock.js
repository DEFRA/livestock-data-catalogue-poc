const LONDON_DATE = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/London',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
})

// Today's date in the UK, as YYYY-MM-DD. Tests pass a fixed moment instead
export function today(now = new Date()) {
  return LONDON_DATE.format(now)
}
