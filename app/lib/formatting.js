const LONG_DATE = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'Europe/London'
})

// "2026-05-20" becomes "20 May 2026", as GOV.UK style asks
export function formatDate(isoDate) {
  return LONG_DATE.format(new Date(`${isoDate}T12:00:00Z`))
}

export function countOf(count, singular, plural) {
  return `${count} ${count === 1 ? singular : plural}`
}
