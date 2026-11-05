import type { Budget } from '../types'
import { money } from '../utils/format'
import { EmptyState } from './Feedback'
export function BudgetProgress({
  budget,
  currency,
}: {
  budget: Budget
  currency: string
}) {
  if (!budget.amount)
    return <EmptyState message="No budget set for this month." />
  return (
    <div className="py-6">
      <div className="flex flex-wrap justify-between gap-2 text-sm">
        <span>{money(budget.spent, currency)} spent</span>
        <span className="text-muted">of {money(budget.amount, currency)}</span>
      </div>
      <div
        role="progressbar"
        aria-label="Monthly budget usage"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.min(100, budget.percentage)}
        aria-valuetext={`${budget.percentage}% spent${budget.exceeded ? ', over budget' : ''}`}
        className="my-4 h-3 overflow-hidden rounded-full bg-secondary"
      >
        <div
          style={{ width: `${Math.min(100, budget.percentage)}%` }}
          className={`h-full rounded-full ${budget.exceeded ? 'bg-[#a64b68]' : 'bg-primary'}`}
        />
      </div>
      <div className="flex flex-wrap justify-between gap-2 text-sm">
        <span
          className={
            budget.exceeded ? 'font-semibold text-[#98506a]' : 'text-muted'
          }
        >
          {budget.exceeded
            ? `${money(budget.remaining!.replace('-', ''), currency)} over budget`
            : `${money(budget.remaining!, currency)} remaining`}
        </span>
        <span>{budget.percentage}%</span>
      </div>
    </div>
  )
}
