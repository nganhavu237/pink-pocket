export function money(value: string, currency = 'USD') {
  // Format cents exactly; Number is used only for chart geometry, never balances.
  const negative = value.startsWith('-')
  const [whole = '0', fraction = '00'] = value.replace('-', '').split('.')
  const parts = new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).formatToParts(BigInt(whole))
  return (
    (negative ? '−' : '') +
    parts
      .map((part) =>
        part.type === 'fraction'
          ? fraction.padEnd(2, '0').slice(0, 2)
          : part.value,
      )
      .join('')
  )
}
export function today() {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
export function currentMonth() {
  return today().slice(0, 7)
}
export function periodQuery(month: string) {
  const [year, value] = month.split('-')
  return `month=${Number(value)}&year=${Number(year)}`
}
export function displayDate(date: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`))
}
