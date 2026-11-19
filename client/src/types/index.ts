export type Kind = 'INCOME' | 'EXPENSE'
export type User = {
  id: string
  name: string
  email: string
  currency: string
  startingBalance: string
}
export type AuthResponse = { user: User; csrfToken: string }
export type Category = {
  id: string
  name: string
  type: Kind
  isDefault: boolean
  isArchived: boolean
}
export type Transaction = {
  id: string
  amount: string
  type: Kind
  date: string
  description: string | null
  categoryId: string
  category: Category
  recurring: { id: string; active: boolean; day: number } | null
}
export type RecurringRule = {
  id: string
  categoryId: string
  category: Category
  amount: string
  type: Kind
  description: string | null
  day: number
  nextDate: string
  active: boolean
}
export type TransactionInput = {
  recurring: boolean
  amount: string
  type: Kind
  date: string
  description: string
  categoryId: string
}
export type TransactionList = {
  items: Transaction[]
  page: number
  pageSize: number
  total: number
  totalPages: number
}
export type Budget = {
  month: number
  year: number
  amount: string | null
  spent: string
  remaining: string | null
  percentage: number
  exceeded: boolean
}
export type Breakdown = { categoryId: string; name: string; amount: string }
export type Summary = {
  month: number
  year: number
  balance: string
  income: string
  expenses: string
  previousExpenses: string
  expenseChangePercent: number | null
  budget: Budget
  recent: Transaction[]
  breakdown: Breakdown[]
}
export type Trend = { month: string; income: string; expenses: string }

export type Task = {
  id: string
  name: string
  dueDate: string | null
  dueTime: string | null
  completed: boolean
  createdAt: string
  updatedAt: string
}

export type CategoryBudget = Budget & {
  id: string
  categoryId: string
  category: { id: string; name: string }
  amount: string
  remaining: string
}
