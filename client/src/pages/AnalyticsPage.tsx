import { useState } from 'react'
import { useResource } from '../hooks/useResource'
import { useAuth } from '../hooks/useAuth'
import { currentMonth, periodQuery } from '../utils/format'
import type { Summary, Trend } from '../types'
import { PageHeader, MonthPicker } from '../components/PageHeader'
import { ExpenseChart, TrendChart } from '../components/Charts'
import { ErrorMessage, LoadingState } from '../components/Feedback'
export function AnalyticsPage() {
  const [month, setMonth] = useState(currentMonth)
  const currency = useAuth().user!.currency
  const summary = useResource<Summary>(
    `/dashboard/summary?${periodQuery(month)}`,
  )
  const trends = useResource<Trend[]>(`/analytics?${periodQuery(month)}`)
  return (
    <>
      <PageHeader title="Analytics">
        <MonthPicker value={month} onChange={setMonth} />
      </PageHeader>
      <div className="grid items-start gap-5 lg:grid-cols-[1.4fr_1fr]">
        <section className="card min-w-0 p-5">
          <h2 className="mb-5 font-semibold">Income vs. Expenses</h2>
          <p className="mb-4 text-xs text-muted">Six months ending {month}</p>
          {trends.loading ? (
            <LoadingState />
          ) : trends.error ? (
            <ErrorMessage message={trends.error} retry={trends.reload} />
          ) : (
            trends.data && (
              <TrendChart items={trends.data} currency={currency} />
            )
          )}
        </section>
        <section className="card p-5">
          <h2 className="mb-4 font-semibold">Spending by Category</h2>
          {summary.loading ? (
            <LoadingState />
          ) : summary.error ? (
            <ErrorMessage message={summary.error} retry={summary.reload} />
          ) : (
            summary.data && (
              <ExpenseChart
                items={summary.data.breakdown}
                currency={currency}
              />
            )
          )}
        </section>
      </div>
    </>
  )
}
