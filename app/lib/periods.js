// A governance assignment or custodian period that includes the date.
// Dates are ISO 8601 (YYYY-MM-DD), so they compare as text.
export function isCurrentOn(period, date) {
  return (
    period.effectiveFromDate <= date &&
    (period.effectiveToDate === undefined || period.effectiveToDate >= date)
  )
}
