export type Kind = 'INCOME' | 'EXPENSE'
export type User = { id: string; name: string; email: string; currency: string }
export type AuthResponse = { user: User; csrfToken: string }
export type Category = { id: string; name: string; type: Kind }
export type Transaction = {
  id: string
  amount: string
  type: Kind
  date: string
  description: string | null
  categoryId: string
  category: Category
}
export type TransactionInput = {
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
  budget: Budget
  recent: Transaction[]
  breakdown: Breakdown[]
}
export type Trend = { month: string; income: string; expenses: string }
