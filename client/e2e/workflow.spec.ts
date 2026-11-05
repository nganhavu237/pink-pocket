import { test, expect } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'

const requireServer = createRequire(
  resolve(import.meta.dirname, '../../server/package.json'),
)
const { config } = requireServer('dotenv')
config({
  path: resolve(import.meta.dirname, '../../server/.env.test'),
  quiet: true,
})
const { Client } = requireServer('pg')
const url = process.env.DATABASE_URL
if (
  process.env.NODE_ENV !== 'test' ||
  !url ||
  !new URL(url).pathname.endsWith('_test')
)
  throw new Error('Dedicated test database required')
const accountEmails: string[] = []
test.afterAll(async () => {
  const client = new Client({ connectionString: url })
  await client.connect()
  try {
    await client.query('DELETE FROM "User" WHERE email = ANY($1::text[])', [
      accountEmails,
    ])
  } finally {
    await client.end()
  }
})

test('register, manage finances, persist settings, and log out', async ({
  page,
}, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const email = `browser-${randomUUID()}@example.test`
  accountEmails.push(email)
  await page.goto('/dashboard')
  await expect(page).toHaveURL(/\/login$/)
  await page
    .getByRole('link', { name: 'Create an account', exact: true })
    .click()
  await page.getByLabel('Name', { exact: true }).fill('Browser Test')
  await page.getByLabel('Email', { exact: true }).fill(email)
  await page
    .getByLabel('Password', { exact: true })
    .fill('Browser-test-password-123')
  await page
    .getByRole('button', { name: 'Create Account', exact: true })
    .click()
  await expect(
    page.getByRole('heading', { name: 'Overview', exact: true }),
  ).toBeVisible()
  await expect(page.getByText('No expenses this month.')).toBeVisible()
  await expect(page.getByText('No budget set for this month.')).toBeVisible()
  await page
    .getByRole('button', { name: 'Add Transaction', exact: true })
    .click()
  await page.getByLabel('Amount', { exact: true }).fill('25.50')
  await page
    .getByLabel('Category', { exact: true })
    .first()
    .selectOption({ label: 'Food' })
  await page
    .getByLabel('Description (optional)', { exact: true })
    .fill('Browser lunch')
  await page
    .getByRole('button', { name: 'Save Transaction', exact: true })
    .click()
  await expect(page.getByText('Browser lunch', { exact: true })).toBeVisible()
  await page
    .getByRole('button', { name: 'Edit Browser lunch', exact: true })
    .click()
  await page.getByLabel('Amount', { exact: true }).fill('30.00')
  await page
    .getByRole('button', { name: 'Save Transaction', exact: true })
    .click()
  await expect(
    page.getByRole('listitem').filter({ hasText: 'Browser lunch' }),
  ).toContainText('−$30.00')
  await page
    .getByRole('button', { name: 'Add Transaction', exact: true })
    .click()
  await page.getByLabel('Type', { exact: true }).first().selectOption('INCOME')
  await page.getByLabel('Amount', { exact: true }).fill('1000.00')
  await page
    .getByLabel('Category', { exact: true })
    .first()
    .selectOption({ label: 'Salary' })
  await page
    .getByLabel('Description (optional)', { exact: true })
    .fill('Browser salary')
  await page
    .getByRole('button', { name: 'Save Transaction', exact: true })
    .click()
  await expect(page.getByText('Browser salary', { exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Budgets', exact: true }).click()
  await page.getByLabel('Budget amount', { exact: true }).fill('100.00')
  await page.getByRole('button', { name: 'Set Budget', exact: true }).click()
  await expect(
    page.getByText('$70.00 remaining', { exact: true }),
  ).toBeVisible()
  await page.getByRole('link', { name: 'Overview', exact: true }).click()
  await expect(page.getByText('$970.00', { exact: true })).toBeVisible()
  await expect(page.getByText('$1,000.00', { exact: true })).toBeVisible()
  await expect(page.getByRole('progressbar')).toHaveAttribute(
    'aria-valuenow',
    '30',
  )
  await expect(page.getByText('Food', { exact: true }).first()).toBeVisible()
  await expect(page.locator('.recharts-sector').first()).toBeVisible()
  await page.screenshot({
    path: testInfo.outputPath('overview.png'),
    fullPage: true,
  })
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true)
  await page.reload()
  await expect(page.getByText('$970.00', { exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Analytics', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Income vs. Expenses', exact: true }),
  ).toBeVisible()
  await expect(page.locator('.recharts-bar').first()).toBeVisible()
  await page.getByRole('link', { name: 'Settings', exact: true }).click()
  await page.getByLabel('Name', { exact: true }).fill('Updated Browser')
  await page.getByLabel('Currency', { exact: true }).selectOption('EUR')
  await page.getByRole('button', { name: 'Save Changes', exact: true }).click()
  await expect(page.getByRole('status')).toHaveText('Settings saved.')
  await page.getByRole('link', { name: 'Transactions', exact: true }).click()
  await page
    .getByRole('button', { name: 'Delete Browser lunch', exact: true })
    .click()
  await expect(page.getByText('Browser lunch', { exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Log Out', exact: true }).click()
  await expect(page).toHaveURL(/\/login$/)
  await page.goto('/dashboard')
  await expect(page).toHaveURL(/\/login$/)
  await page.getByLabel('Email', { exact: true }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill('wrong-password')
  await page.getByRole('button', { name: 'Log In', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText(
    'Email or password is incorrect',
  )
  await page
    .getByLabel('Password', { exact: true })
    .fill('Browser-test-password-123')
  await page.getByRole('button', { name: 'Log In', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Overview', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByText('€1,000.00', { exact: true }).first(),
  ).toBeVisible()
  const cookies = await page.context().cookies()
  expect(
    cookies.find((cookie) => cookie.name === 'pink_pocket_session')?.httpOnly,
  ).toBe(true)
  expect(await page.evaluate(() => window.localStorage.length)).toBe(0)
  expect(errors).toEqual([])
})
