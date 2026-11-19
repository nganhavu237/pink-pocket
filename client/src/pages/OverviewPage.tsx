import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ArrowDownLeft,
  ArrowUpRight,
  Wallet,
  Plus,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useResource } from '../hooks/useResource'
import { currentMonth, money, periodQuery } from '../utils/format'
import type { Summary } from '../types'
import { PageHeader, MonthPicker } from '../components/PageHeader'
import { ErrorMessage, LoadingState } from '../components/Feedback'
import { BudgetProgress } from '../components/BudgetProgress'
import { ExpenseChart } from '../components/Charts'
import { MySpacePhoto } from '../components/MySpacePhoto'
import { TransactionTable } from '../components/TransactionTable'
export function OverviewPage() {
  const [month, setMonth] = useState(currentMonth)
  const navigate = useNavigate()
  const { user } = useAuth()
  const currency = user!.currency
  const { data, error, loading, reload } = useResource<Summary>(
    `/dashboard/summary?${periodQuery(month)}`,
  )
  return (
    <>
      <PageHeader title="Overview">
        <MonthPicker value={month} onChange={setMonth} />
        <button
          className="button-primary"
          onClick={() => navigate('/transactions?add=1')}
        >
          <Plus size={17} aria-hidden="true" />
          Add Transaction
        </button>
      </PageHeader>
      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorMessage message={error} retry={reload} />
      ) : (
        data && (
          <>
            <section
              aria-label="Financial summary"
              className="grid gap-4 sm:grid-cols-3"
            >
              {[
                {
                  label: 'Current Balance',
                  value: data.balance,
                  icon: Wallet,
                  color: 'bg-secondary',
                },
                {
                  label: 'Monthly Income',
                  value: data.income,
                  icon: ArrowDownLeft,
                  color: 'bg-sage',
                },
                {
                  label: 'Monthly Expenses',
                  value: data.expenses,
                  icon: ArrowUpRight,
                  color: 'bg-lavender',
                },
              ].map(({ label, value, icon: Icon, color }) => (
                <article key={label} className="card p-5">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-sm text-muted">{label}</h2>
                    <span className={`rounded-lg p-2 ${color}`}>
                      <Icon size={18} aria-hidden="true" />
                    </span>
                  </div>
                  <p className="mt-4 break-words text-2xl font-semibold">
                    {money(value, currency)}
                  </p>
                  {label === 'Monthly Expenses' && (
                    <ExpenseComparison percentage={data.expenseChangePercent} />
                  )}
                </article>
              ))}
            </section>
            <div className="mt-5 grid gap-5 md:grid-cols-2">
              <div className="flex min-w-0 flex-col gap-5">
                <section className="card p-5">
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="font-semibold">Budget Progress</h2>
                    <Link
                      className="text-sm underline underline-offset-4"
                      to={`/budgets?month=${month}`}
                    >
                      Edit budget
                    </Link>
                  </div>
                  <BudgetProgress budget={data.budget} currency={currency} />
                </section>
                <MySpacePhoto key={user!.id} />
              </div>
              <section className="card p-5">
                <h2 className="mb-4 font-semibold">Spending Breakdown</h2>
                <ExpenseChart items={data.breakdown} currency={currency} />
              </section>
            </div>
            <section className="card mt-5 p-5">
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-semibold">Recent Transactions</h2>
                <Link
                  className="text-sm underline underline-offset-4"
                  to={`/transactions?month=${month}`}
                >
                  View all
                </Link>
              </div>
              <TransactionTable items={data.recent} currency={currency} />
            </section>
          </>
        )
      )}
    </>
  )
}

function ExpenseComparison({ percentage }: { percentage: number | null }) {
  if (percentage === null)
    return <p className="mt-2 text-xs text-muted">No previous data</p>
  if (percentage === 0)
    return <p className="mt-2 text-xs text-muted">Same as last month</p>
  const lower = percentage < 0
  const Icon = lower ? TrendingDown : TrendingUp
  return (
    <p
      className={`mt-2 flex items-center gap-1 text-xs ${lower ? 'text-[#4c6a55]' : 'text-[#98506a]'}`}
    >
      <Icon size={14} aria-hidden="true" />
      {new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(
        Math.abs(percentage),
      )}
      % {lower ? 'less' : 'more'} than last month
    </p>
  )
}
