import { useEffect, useState, useSyncExternalStore } from 'react'
import { Coffee, ShoppingBasket, TrainFront } from 'lucide-react'

// Public illustration only: never read account state or financial APIs here.
const demoMonths = [
  {
    month: 'October',
    spending: 1248.5,
    budget: 2000,
    transactions: [
      {
        name: 'Weekly groceries',
        category: 'Food',
        amount: 68.4,
        icon: ShoppingBasket,
        color: 'bg-sage',
      },
      {
        name: 'Morning coffee',
        category: 'Food',
        amount: 5.5,
        icon: Coffee,
        color: 'bg-lavender',
      },
      {
        name: 'Train pass',
        category: 'Transportation',
        amount: 85,
        icon: TrainFront,
        color: 'bg-sky',
      },
    ],
  },
  {
    month: 'November',
    spending: 1680.25,
    budget: 2200,
    transactions: [
      {
        name: 'Neighborhood market',
        category: 'Food',
        amount: 74.25,
        icon: ShoppingBasket,
        color: 'bg-sage',
      },
      {
        name: 'Coffee with a friend',
        category: 'Food',
        amount: 11,
        icon: Coffee,
        color: 'bg-lavender',
      },
      {
        name: 'Train pass',
        category: 'Transportation',
        amount: 85,
        icon: TrainFront,
        color: 'bg-sky',
      },
    ],
  },
]
const dollars = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
})
const motionQuery = '(prefers-reduced-motion: reduce)'
function subscribeMotion(callback: () => void) {
  const query = window.matchMedia(motionQuery)
  query.addEventListener('change', callback)
  return () => query.removeEventListener('change', callback)
}
function useCountProgress() {
  const reduced = useSyncExternalStore(
    subscribeMotion,
    () => window.matchMedia(motionQuery).matches,
    () => true,
  )
  const [progress, setProgress] = useState(0)
  useEffect(() => {
    if (reduced) return
    let frame = 0
    const start = performance.now()
    function animate(now: number) {
      const elapsed = Math.min((now - start) / 950, 1)
      setProgress(1 - (1 - elapsed) ** 3)
      if (elapsed < 1) frame = requestAnimationFrame(animate)
    }
    frame = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(frame)
  }, [reduced])
  return reduced ? 1 : progress
}

export function LandingPreview() {
  const [selected, setSelected] = useState(1)
  const demo = demoMonths[selected]!
  return (
    <section
      className="landing-preview card min-w-0 p-5 sm:p-7"
      aria-labelledby="demo-heading"
      aria-describedby="demo-disclaimer"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="demo-heading" className="text-sm font-semibold">
          Dashboard preview
        </h2>
        <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-medium">
          Demo data
        </span>
      </div>
      <div className="mt-5 flex items-center justify-between gap-3">
        <p className="text-xs text-muted">Monthly overview</p>
        <label className="text-xs">
          <span className="sr-only">Demo month</span>
          <select
            aria-label="Demo month"
            className="rounded-lg border border-line bg-white px-2 py-2 text-xs"
            value={selected}
            onChange={(event) => setSelected(Number(event.target.value))}
          >
            {demoMonths.map((item, index) => (
              <option key={item.month} value={index}>
                {item.month}
              </option>
            ))}
          </select>
        </label>
      </div>
      <DemoFigures key={demo.month} demo={demo} />
      <div className="mt-6 border-t border-line pt-5">
        <h3 className="mb-2 text-xs font-semibold text-muted">
          Recent transactions
        </h3>
        <ul className="divide-y divide-line">
          {demo.transactions.map(
            ({ name, category, amount, icon: Icon, color }) => (
              <li key={name} className="flex items-center gap-3 py-3">
                <span className={`rounded-lg p-2 ${color}`}>
                  <Icon size={17} aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{name}</p>
                  <p className="mt-0.5 text-xs text-muted">{category}</p>
                </div>
                <span className="whitespace-nowrap text-sm font-medium">
                  −{dollars.format(amount)}
                </span>
              </li>
            ),
          )}
        </ul>
      </div>
      <p id="demo-disclaimer" className="mt-3 text-xs text-muted">
        Sample amounts · Not connected to your account
      </p>
    </section>
  )
}
function DemoFigures({ demo }: { demo: (typeof demoMonths)[number] }) {
  const progress = useCountProgress()
  const remaining = demo.budget - demo.spending
  const percentage = (demo.spending / demo.budget) * 100
  return (
    <>
      <div className="mt-4 grid grid-cols-2 gap-3">
        {[
          {
            label: 'Monthly Spending',
            amount: demo.spending,
            color: 'bg-secondary',
          },
          { label: 'Budget Remaining', amount: remaining, color: 'bg-sage' },
        ].map(({ label, amount, color }) => (
          <div key={label} className={`rounded-xl p-3 sm:p-4 ${color}`}>
            <h3 className="text-xs leading-5">{label}</h3>
            <p className="mt-2 text-xl font-semibold tracking-tight tabular-nums sm:text-2xl">
              <span aria-hidden="true">
                {dollars.format(amount * progress)}
              </span>
              <span className="sr-only">{dollars.format(amount)}</span>
            </p>
          </div>
        ))}
      </div>
      <div className="mt-5 flex justify-between gap-2 text-xs text-muted">
        <span>Budget usage</span>
        <span>{dollars.format(demo.budget)} budget</span>
      </div>
      <div
        role="progressbar"
        aria-label={`${demo.month} demo budget usage`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(percentage)}
        aria-valuetext={`${Math.round(percentage)}% of ${dollars.format(demo.budget)}`}
        className="mt-2 h-2.5 overflow-hidden rounded-full bg-secondary"
      >
        <div
          className="h-full origin-left rounded-full bg-primary"
          style={{ width: `${percentage}%`, transform: `scaleX(${progress})` }}
        />
      </div>
      <p role="status" className="mt-2 text-right text-xs text-muted">
        {Math.round(percentage)}% used
      </p>
    </>
  )
}
