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

const DATE_TIME = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
  timeZone: 'Europe/London'
})

// The GOV.UK style for times: 9:05am, 2:30pm, midday and midnight
function timeText({ hour, minute, dayPeriod }) {
  const period = dayPeriod.toLowerCase()
  if (hour === '12' && minute === '00') {
    return period === 'am' ? 'midnight' : 'midday'
  }
  return `${hour}:${minute}${period}`
}

// "2026-11-12T10:38:00Z" becomes "12 November 2026, 10:38am", UK time
export function formatDateTime(isoDateTime) {
  const parts = Object.fromEntries(
    DATE_TIME.formatToParts(new Date(isoDateTime)).map(({ type, value }) => [
      type,
      value
    ])
  )
  return `${parts.day} ${parts.month} ${parts.year}, ${timeText(parts)}`
}

export function countOf(count, singular, plural) {
  return `${count} ${count === 1 ? singular : plural}`
}
