import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
} from 'recharts'
import type { Breakdown, Trend } from '../types'
import { EmptyState } from './Feedback'
import { money } from '../utils/format'
const colors = [
  '#F4A7B9',
  '#E6D9F2',
  '#DCEBDD',
  '#DCEAF7',
  '#E5C4A9',
  '#C1BDDB',
  '#B6D5C8',
]
export function ExpenseChart({
  items,
  currency,
}: {
  items: Breakdown[]
  currency: string
}) {
  if (!items.length) return <EmptyState message="No expenses this month." />
  const chart = items.map((item) => ({ ...item, value: Number(item.amount) }))
  return (
    <div>
      <div className="h-52" aria-label="Expense distribution by category">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              isAnimationActive={false}
              data={chart}
              dataKey="value"
              nameKey="name"
              innerRadius={52}
              outerRadius={78}
              paddingAngle={2}
            >
              {chart.map((item, i) => (
                <Cell key={item.categoryId} fill={colors[i % colors.length]} />
              ))}
            </Pie>
            <Tooltip
              formatter={(_value, _name, item) =>
                money((item.payload as Breakdown).amount, currency)
              }
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="space-y-2">
        {items.map((item, i) => (
          <li
            key={item.categoryId}
            className="flex justify-between gap-3 text-sm"
          >
            <span className="flex items-center gap-2">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ background: colors[i % colors.length] }}
              />
              {item.name}
            </span>
            <span>{money(item.amount, currency)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
export function TrendChart({
  items,
  currency,
}: {
  items: Trend[]
  currency: string
}) {
  if (!items.some((item) => item.income !== '0.00' || item.expenses !== '0.00'))
    return <EmptyState message="No activity in the last six months." />
  const rows = items.map((item) => ({
    ...item,
    income: Number(item.income),
    expenses: Number(item.expenses),
  }))
  return (
    <>
      <div className="h-64" aria-label="Monthly income and expenses">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows}>
            <CartesianGrid stroke="#eee6e9" vertical={false} />
            <XAxis
              dataKey="month"
              tickFormatter={(value) => String(value).slice(5)}
            />
            <YAxis width={50} tick={{ fontSize: 11 }} />
            <Tooltip
              formatter={(value) =>
                new Intl.NumberFormat(undefined, {
                  style: 'currency',
                  currency,
                }).format(Number(value))
              }
            />
            <Legend />
            <Bar
              isAnimationActive={false}
              dataKey="income"
              name="Income"
              fill="#DCEBDD"
              radius={[4, 4, 0, 0]}
            />
            <Bar
              isAnimationActive={false}
              dataKey="expenses"
              name="Expenses"
              fill="#F4A7B9"
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-muted">
          View monthly totals
        </summary>
        <ul className="mt-3 space-y-2">
          {items.map((item) => (
            <li
              key={item.month}
              className="flex flex-wrap justify-between gap-2"
            >
              <span>{item.month}</span>
              <span>
                Income {money(item.income, currency)} · Expenses{' '}
                {money(item.expenses, currency)}
              </span>
            </li>
          ))}
        </ul>
      </details>
    </>
  )
}
