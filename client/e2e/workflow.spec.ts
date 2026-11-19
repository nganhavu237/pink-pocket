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
  const filters = page.getByRole('region', { name: 'Transaction filters' })
  await expect(filters.getByRole('checkbox')).toHaveCount(0)
  const filterHeights = await filters
    .locator('input, select')
    .evaluateAll((elements) =>
      elements.map((element) => element.getBoundingClientRect().height),
    )
  expect(filterHeights).toEqual([44, 44, 44, 44])
  await filters
    .getByRole('combobox', { name: 'Type', exact: true })
    .selectOption('EXPENSE')
  await filters
    .getByRole('combobox', { name: 'Category', exact: true })
    .selectOption({ label: 'Food' })
  await expect(page.getByText('Browser lunch', { exact: true })).toBeVisible()
  await expect(page.getByText('Browser salary', { exact: true })).toHaveCount(0)
  await filters
    .getByRole('searchbox', { name: 'Search', exact: true })
    .fill('missing transaction')
  await expect(
    page.getByText('No transactions for these filters.', { exact: true }),
  ).toBeVisible()
  await filters
    .getByRole('searchbox', { name: 'Search', exact: true })
    .fill('Browser lunch')
  await expect(page.getByText('Browser lunch', { exact: true })).toBeVisible()
  await filters.getByRole('searchbox', { name: 'Search', exact: true }).fill('')
  await filters
    .getByRole('combobox', { name: 'Type', exact: true })
    .selectOption('INCOME')
  await expect(
    filters.getByRole('combobox', { name: 'Category', exact: true }),
  ).toHaveValue('')
  await expect(page.getByText('Browser salary', { exact: true })).toBeVisible()
  await expect(page.getByText('Browser lunch', { exact: true })).toHaveCount(0)
  const monthInput = filters.getByLabel('Month', { exact: true })
  const selectedMonth = await monthInput.inputValue()
  const previousMonth = new Date(selectedMonth + '-01T00:00:00Z')
  previousMonth.setUTCMonth(previousMonth.getUTCMonth() - 1)
  await monthInput.fill(previousMonth.toISOString().slice(0, 7))
  await expect(
    page.getByText('No transactions for these filters.', { exact: true }),
  ).toBeVisible()
  await monthInput.fill(selectedMonth)
  await filters
    .getByRole('combobox', { name: 'Type', exact: true })
    .selectOption('')
  await expect(page.getByText('Browser salary', { exact: true })).toBeVisible()
  await expect(page.getByText('Browser lunch', { exact: true })).toBeVisible()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
  await filters.screenshot({ path: testInfo.outputPath('filters.png') })
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

test('monthly repeats, starting balance, and previous-month comparison', async ({
  page,
}) => {
  const email = `features-${randomUUID()}@example.test`
  accountEmails.push(email)
  await page.goto('/register')
  await page.getByLabel('Name', { exact: true }).fill('Feature Browser')
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
  await page.getByRole('link', { name: 'Settings', exact: true }).click()
  await page.getByLabel('Starting Balance', { exact: true }).fill('500.25')
  await page.getByRole('button', { name: 'Save Changes', exact: true }).click()
  await expect(page.getByRole('status')).toHaveText('Settings saved.')
  await page.getByRole('link', { name: 'Overview', exact: true }).click()
  await expect(page.getByText('$500.25', { exact: true })).toBeVisible()
  await expect(
    page.getByText('No previous data', { exact: true }),
  ).toBeVisible()
  await page
    .getByRole('button', { name: 'Add Transaction', exact: true })
    .click()
  await page.getByLabel('Amount', { exact: true }).fill('100.00')
  await page
    .getByLabel('Category', { exact: true })
    .first()
    .selectOption({ label: 'Bills' })
  const previous = new Date()
  previous.setUTCDate(1)
  previous.setUTCMonth(previous.getUTCMonth() - 1)
  await page
    .getByLabel('Date', { exact: true })
    .fill(previous.toISOString().slice(0, 10))
  await page
    .getByLabel('Description (optional)', { exact: true })
    .fill('Monthly rent')
  await page.getByLabel('Repeat monthly', { exact: true }).check()
  await page
    .getByRole('button', { name: 'Save Transaction', exact: true })
    .click()
  await expect(page.getByText('Monthly rent', { exact: true })).toBeVisible()
  await expect(page.getByText(/Repeats monthly/)).toBeVisible()
  await page
    .getByRole('button', { name: 'Edit Monthly rent', exact: true })
    .click()
  await expect(page.getByLabel('Repeat monthly', { exact: true })).toBeChecked()
  await page.getByLabel('Amount', { exact: true }).fill('88.00')
  await page
    .getByRole('button', { name: 'Save Transaction', exact: true })
    .click()
  await expect(
    page.getByRole('listitem').filter({ hasText: 'Monthly rent' }),
  ).toContainText('−$88.00')
  await page.getByText('Monthly repeats (1)', { exact: true }).click()
  await page
    .getByRole('button', { name: 'Edit repeat Monthly rent', exact: true })
    .click()
  await page.getByLabel('Amount', { exact: true }).fill('77.00')
  await page.getByRole('button', { name: 'Save Repeat', exact: true }).click()
  await page.getByText('Monthly repeats (1)', { exact: true }).click()
  await expect(
    page.getByText('Monthly rent · $77.00', { exact: true }),
  ).toBeVisible()
  await page
    .getByRole('button', { name: 'Stop repeat Monthly rent', exact: true })
    .click()
  await expect(
    page.getByText('Monthly repeats (1)', { exact: true }),
  ).toHaveCount(0)
  await page.getByRole('link', { name: 'Overview', exact: true }).click()
  await expect(page.getByText('$312.25', { exact: true })).toBeVisible()
  await expect(
    page.getByText('12% less than last month', { exact: true }),
  ).toBeVisible()
  await expect(page.getByText('$0.00', { exact: true })).toBeVisible()
  await page
    .getByLabel('Month', { exact: true })
    .fill(previous.toISOString().slice(0, 7))
  await expect(
    page.getByText('No previous data', { exact: true }),
  ).toBeVisible()
  await expect(page.getByText('$100.00', { exact: true }).first()).toBeVisible()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
  await page.reload()
  await page.getByRole('link', { name: 'Settings', exact: true }).click()
  await expect(
    page.getByLabel('Starting Balance', { exact: true }),
  ).toHaveValue('500.25')
})

test('Planner checklist persists through refresh and login', async ({
  page,
}, testInfo) => {
  const email = `planner-${randomUUID()}@example.test`
  accountEmails.push(email)
  await page.goto('/planner')
  await expect(page).toHaveURL(/\/login$/)
  await page
    .getByRole('link', { name: 'Create an account', exact: true })
    .click()
  await page.getByLabel('Name', { exact: true }).fill('Planner Browser')
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
  await page.getByRole('link', { name: 'Planner', exact: true }).click()
  await expect(page.getByText('No tasks yet.', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Add Task', exact: true }).click()
  await expect(page.getByLabel('Task name', { exact: true })).toBeFocused()
  await page.getByLabel('Task name', { exact: true }).fill('Prepare budget')
  await page.getByLabel('Due date', { exact: true }).fill('2050-05-23')
  await page.getByLabel('Due time', { exact: true }).fill('14:30')
  await page.getByRole('button', { name: 'Save Task', exact: true }).click()
  await expect(page.getByText('Prepare budget', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Add Task', exact: true }).click()
  await page.getByLabel('Task name', { exact: true }).fill('Review spending')
  await page.getByRole('button', { name: 'Save Task', exact: true }).click()
  await page
    .getByRole('checkbox', {
      name: 'Mark Prepare budget as completed',
      exact: true,
    })
    .check()
  await expect(
    page.getByRole('checkbox', {
      name: 'Mark Prepare budget as incomplete',
      exact: true,
    }),
  ).toBeChecked()
  const tasks = page.getByRole('region', { name: 'Tasks', exact: true })
  await expect(tasks.getByRole('listitem').first()).toContainText(
    'Review spending',
  )
  await expect(tasks.getByRole('listitem').last()).toContainText(
    'Prepare budget',
  )
  await page
    .getByRole('button', { name: 'Edit Prepare budget', exact: true })
    .click()
  await expect(page.getByLabel('Due date', { exact: true })).toHaveValue(
    '2050-05-23',
  )
  await expect(page.getByLabel('Due time', { exact: true })).toHaveValue(
    '14:30',
  )
  await page.getByLabel('Task name', { exact: true }).fill('Budget ready')
  await page.getByLabel('Due date', { exact: true }).fill('')
  await page.getByLabel('Due time', { exact: true }).fill('')
  await page.getByRole('button', { name: 'Save Task', exact: true }).click()
  await expect(
    page.getByRole('checkbox', {
      name: 'Mark Budget ready as incomplete',
      exact: true,
    }),
  ).toBeChecked()
  await page.reload()
  await expect(
    page.getByRole('checkbox', {
      name: 'Mark Budget ready as incomplete',
      exact: true,
    }),
  ).toBeChecked()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
  await page.screenshot({
    path: testInfo.outputPath('planner.png'),
    fullPage: true,
  })
  await page.getByRole('button', { name: 'Log Out', exact: true }).click()
  await expect(page).toHaveURL(/\/login$/)
  await page.goto('/planner')
  await expect(page).toHaveURL(/\/login$/)
  await page.getByLabel('Email', { exact: true }).fill(email)
  await page
    .getByLabel('Password', { exact: true })
    .fill('Browser-test-password-123')
  await page.getByRole('button', { name: 'Log In', exact: true }).click()
  await expect(
    page.getByRole('link', { name: 'Planner', exact: true }),
  ).toBeVisible()
  await page.getByRole('link', { name: 'Planner', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Planner', exact: true }),
  ).toBeVisible()
  await expect(page.getByText('Review spending', { exact: true })).toBeVisible()
  await page
    .getByRole('checkbox', {
      name: 'Mark Budget ready as incomplete',
      exact: true,
    })
    .uncheck()
  await expect(
    page.getByRole('checkbox', {
      name: 'Mark Budget ready as completed',
      exact: true,
    }),
  ).not.toBeChecked()
  await page.route('**/api/tasks/*', (route) =>
    route.request().method() === 'PUT'
      ? route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ error: { message: 'Could not save task' } }),
        })
      : route.continue(),
  )
  await page
    .getByRole('checkbox', {
      name: 'Mark Budget ready as completed',
      exact: true,
    })
    .click()
  await expect(page.getByRole('alert')).toContainText('Could not save task')
  await expect(
    page.getByRole('checkbox', {
      name: 'Mark Budget ready as completed',
      exact: true,
    }),
  ).not.toBeChecked()
  await page.unroute('**/api/tasks/*')
  await page
    .getByRole('button', { name: 'Delete Budget ready', exact: true })
    .click()
  await expect(page.getByText('Budget ready', { exact: true })).toHaveCount(0)
  await page.reload()
  await expect(page.getByText('Budget ready', { exact: true })).toHaveCount(0)
  await expect(page.getByText('Review spending', { exact: true })).toBeVisible()
})

test('custom categories and display currencies persist safely', async ({
  page,
}, testInfo) => {
  const email = `categories-${randomUUID()}@example.test`
  accountEmails.push(email)
  await page.goto('/register')
  await page.getByLabel('Name', { exact: true }).fill('Category Browser')
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
  await page
    .getByRole('button', { name: 'Add Transaction', exact: true })
    .click()
  await page.getByLabel('Amount', { exact: true }).fill('42.75')
  await page
    .getByLabel('Description (optional)', { exact: true })
    .fill('Book club')
  const category = page
    .getByRole('combobox', { name: 'Category', exact: true })
    .first()
  await category.selectOption('__add__')
  await page.getByLabel('Category name', { exact: true }).fill('Hobbies')
  await page.getByRole('button', { name: 'Add Category', exact: true }).click()
  await expect(category.locator('option:checked')).toHaveText('Hobbies')
  await expect(page.getByLabel('Amount', { exact: true })).toHaveValue('42.75')
  await expect(
    page.getByLabel('Description (optional)', { exact: true }),
  ).toHaveValue('Book club')
  await page
    .getByRole('button', { name: 'Save Transaction', exact: true })
    .click()
  await expect(page.getByText('Book club', { exact: true })).toBeVisible()
  await page
    .getByRole('button', { name: 'Add Transaction', exact: true })
    .click()
  await page
    .getByRole('combobox', { name: 'Type', exact: true })
    .first()
    .selectOption('INCOME')
  await expect(
    category.getByRole('option', { name: 'Other Income', exact: true }),
  ).toHaveCount(0)
  await category.selectOption('__add__')
  await page.getByLabel('Category name', { exact: true }).fill('Freelance')
  await page.getByRole('button', { name: 'Add Category', exact: true }).click()
  await expect(category.locator('option:checked')).toHaveText('Freelance')
  await page.getByLabel('Amount', { exact: true }).fill('100.00')
  await page
    .getByLabel('Description (optional)', { exact: true })
    .fill('Contract')
  await page
    .getByRole('button', { name: 'Save Transaction', exact: true })
    .click()
  await expect(page.getByText('Contract', { exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Settings', exact: true }).click()
  await expect(page.getByText('Other Income', { exact: true })).toHaveCount(0)
  await expect(page.getByText('Salary', { exact: true })).toBeVisible()
  await page
    .getByRole('button', { name: 'Rename Hobbies', exact: true })
    .click()
  await page.getByLabel('Category name', { exact: true }).fill('Leisure')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText('Leisure', { exact: true })).toBeVisible()
  await page
    .getByRole('button', { name: 'Delete category Leisure', exact: true })
    .click()
  await expect(page.getByRole('alert')).toContainText('Rename it instead')
  await expect(page.getByText('Leisure', { exact: true })).toBeVisible()
  await page
    .getByRole('combobox', { name: 'Currency', exact: true })
    .selectOption('VND')
  await page.getByRole('button', { name: 'Save Changes', exact: true }).click()
  await expect(page.getByRole('status')).toHaveText('Settings saved.')
  await page.reload()
  await expect(
    page.getByRole('combobox', { name: 'Currency', exact: true }),
  ).toHaveValue('VND')
  await page
    .getByRole('combobox', { name: 'Currency', exact: true })
    .selectOption('CUSTOM')
  await page.getByLabel('Currency code', { exact: true }).fill('jpy')
  await page.getByRole('button', { name: 'Save Changes', exact: true }).click()
  await expect(page.getByRole('status')).toHaveText('Settings saved.')
  await page.reload()
  await expect(
    page.getByRole('combobox', { name: 'Currency', exact: true }),
  ).toHaveValue('CUSTOM')
  await expect(page.getByLabel('Currency code', { exact: true })).toHaveValue(
    'JPY',
  )
  expect(
    await page
      .locator('.settings-field .field')
      .evaluateAll((elements) =>
        elements.every(
          (element) => element.getBoundingClientRect().height === 44,
        ),
      ),
  ).toBe(true)
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
  await page.screenshot({
    path: testInfo.outputPath('settings-currency.png'),
    fullPage: true,
  })
  await page.getByLabel('Currency code', { exact: true }).fill('ZZZ')
  await page.getByRole('button', { name: 'Save Changes', exact: true }).click()
  await expect(page.locator('.settings-form').getByRole('alert')).toContainText(
    'recognized currency code',
  )
  await page.getByRole('link', { name: 'Transactions', exact: true }).click()
  await expect(page.getByText('Book club', { exact: true })).toBeVisible()
  await expect(
    page.getByRole('listitem').filter({ hasText: 'Book club' }),
  ).toContainText('Leisure')
  await page
    .getByRole('button', { name: 'Add Transaction', exact: true })
    .click()
  await category.selectOption('__add__')
  await page.getByLabel('Category name', { exact: true }).fill('Temporary')
  await page.getByRole('button', { name: 'Add Category', exact: true }).click()
  await expect(category.locator('option:checked')).toHaveText('Temporary')
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.getByRole('link', { name: 'Settings', exact: true }).click()
  await page
    .getByRole('button', { name: 'Delete category Temporary', exact: true })
    .click()
  await expect(page.getByText('Temporary', { exact: true })).toHaveCount(0)
  await page.reload()
  await expect(page.getByLabel('Currency code', { exact: true })).toHaveValue(
    'JPY',
  )
  await expect(page.getByText('Temporary', { exact: true })).toHaveCount(0)
})

test('My Space photo upload, replace and remove persists privately', async ({
  page,
}, testInfo) => {
  const email = `photo-${randomUUID()}@example.test`
  accountEmails.push(email)
  const sharp = requireServer('sharp')
  const image = await sharp({
    create: { width: 320, height: 180, channels: 3, background: '#F4A7B9' },
  })
    .png()
    .toBuffer()
  const replacement = await sharp({
    create: { width: 200, height: 200, channels: 3, background: '#C8DDC3' },
  })
    .jpeg()
    .toBuffer()
  await page.goto('/register')
  await page.getByLabel('Name', { exact: true }).fill('Photo Browser')
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
  const widget = page.getByRole('region', { name: 'My Space', exact: true })
  await expect(
    widget.getByRole('button', { name: 'Upload photo', exact: true }),
  ).toBeVisible()
  const chooser = page.waitForEvent('filechooser')
  await widget
    .getByRole('button', { name: 'Upload photo', exact: true })
    .click()
  await (
    await chooser
  ).setFiles({ name: 'personal.png', mimeType: 'image/png', buffer: image })
  const photo = widget.getByRole('img', { name: 'My Space photo', exact: true })
  await expect(photo).toBeVisible()
  await expect
    .poll(() =>
      photo.evaluate((element) => (element as HTMLImageElement).naturalWidth),
    )
    .toBeGreaterThan(0)
  const firstSource = await photo.getAttribute('src')
  expect(firstSource).toContain('/api/my-space/photo?v=')
  const budget = page
    .getByRole('heading', { name: 'Budget Progress', exact: true })
    .locator('..')
    .locator('..')
  const budgetBox = await budget.boundingBox(),
    photoBox = await widget.boundingBox()
  expect(photoBox!.y).toBeGreaterThanOrEqual(budgetBox!.y + budgetBox!.height)
  expect(photoBox!.x).toBe(budgetBox!.x)
  expect(photoBox!.width).toBe(budgetBox!.width)
  if (page.viewportSize()!.width >= 768) {
    const breakdownBox = await page
      .getByRole('heading', { name: 'Spending Breakdown', exact: true })
      .locator('..')
      .boundingBox()
    expect(
      Math.abs(
        photoBox!.y + photoBox!.height - breakdownBox!.y - breakdownBox!.height,
      ),
    ).toBeLessThan(1)
  }
  await page.screenshot({
    path: testInfo.outputPath('overview.png'),
    fullPage: true,
  })

  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
  await widget.screenshot({ path: testInfo.outputPath('my-space.png') })
  await page.reload()
  await expect(photo).toHaveAttribute('src', firstSource!)
  await widget.locator('input[type=file]').setInputFiles({
    name: 'unsupported.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from('<svg/>'),
  })
  await expect(widget.getByRole('alert')).toContainText('JPEG, PNG or WebP')
  await expect(photo).toHaveAttribute('src', firstSource!)
  await widget.locator('input[type=file]').setInputFiles({
    name: 'large.png',
    mimeType: 'image/png',
    buffer: Buffer.alloc(5 * 1024 * 1024 + 1),
  })
  await expect(widget.getByRole('alert')).toContainText('up to 5 MB')
  await expect(photo).toHaveAttribute('src', firstSource!)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const replaceChooser = page.waitForEvent('filechooser')
  await widget
    .getByRole('button', { name: 'Replace photo', exact: true })
    .click()
  await (
    await replaceChooser
  ).setFiles({
    name: 'replacement.jpg',
    mimeType: 'image/jpeg',
    buffer: replacement,
  })
  await expect(photo).not.toHaveAttribute('src', firstSource!)
  await expect
    .poll(() =>
      photo.evaluate((element) => (element as HTMLImageElement).naturalWidth),
    )
    .toBeGreaterThan(0)
  expect(
    await photo.evaluate((element) => getComputedStyle(element).animationName),
  ).toBe('none')
  const replacementSource = await photo.getAttribute('src')
  await page.getByRole('button', { name: 'Log Out', exact: true }).click()
  await expect(page).toHaveURL(/\/login$/)
  await page.getByLabel('Email', { exact: true }).fill(email)
  await page
    .getByLabel('Password', { exact: true })
    .fill('Browser-test-password-123')
  await page.getByRole('button', { name: 'Log In', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Overview', exact: true }),
  ).toBeVisible()
  await expect(photo).toHaveAttribute('src', replacementSource!)
  await widget
    .getByRole('button', { name: 'Remove photo', exact: true })
    .click()
  await expect(
    widget.getByRole('button', { name: 'Upload photo', exact: true }),
  ).toBeVisible()
  await expect(photo).toHaveCount(0)
  await page.reload()
  await expect(
    widget.getByRole('button', { name: 'Upload photo', exact: true }),
  ).toBeVisible()
  await expect(photo).toHaveCount(0)
})

test('Toki branding preserves the supplied logo on landing and authentication', async ({
  page,
}, testInfo) => {
  await page.goto('/')
  await expect(page).toHaveTitle('Toki · Expense tracker & daily planner')
  const brand = page.getByRole('link', { name: 'Toki home', exact: true })
  await expect(brand.locator('svg')).toHaveAttribute(
    'viewBox',
    '110 395 1040 460',
  )
  await expect(brand.locator('image')).toHaveAttribute(
    'href',
    '/images/toki-logo.png',
  )
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({
    path: testInfo.outputPath('toki-landing.png'),
    fullPage: true,
    animations: 'disabled',
  })
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
  await page.goto('/login')
  await expect(page).toHaveTitle('Log in · Toki')
  await expect(brand).toBeVisible()
})

test('Overview carousel shares Planner tasks and remembers each user’s view', async ({
  page,
}, testInfo) => {
  const email = `carousel-${randomUUID()}@example.test`
  accountEmails.push(email)
  const origin = 'http://127.0.0.1:5180'
  const registration = await page.request.post('/api/auth/register', {
    headers: { Origin: origin },
    data: {
      name: 'Carousel Browser',
      email,
      password: 'Browser-test-password-123',
    },
  })
  expect(registration.status()).toBe(201)
  const { data: session } = await registration.json()
  const tasks = []
  for (const task of [
    { name: 'Overdue task', dueDate: '2020-01-01' },
    { name: 'Future task', dueDate: '2099-12-31' },
    { name: 'No date task' },
    { name: 'Already done', completed: true },
    ...Array.from({ length: 7 }, (_, i) => ({ name: `Extra task ${i}` })),
  ]) {
    const response = await page.request.post('/api/tasks', {
      headers: { Origin: origin, 'X-CSRF-Token': session.csrfToken },
      data: task,
    })
    expect(response.status()).toBe(201)
    tasks.push((await response.json()).data)
  }
  await page.goto('/dashboard')
  const card = page.locator('.my-space-photo')
  await expect(
    card.getByRole('heading', { name: 'My Space', exact: true }),
  ).toBeVisible()
  await expect(
    card.getByRole('button', { name: 'Upload photo', exact: true }),
  ).toBeVisible()
  const before = await card.boundingBox()
  const previous = card.getByRole('button', {
    name: 'Previous view',
    exact: true,
  })
  const next = card.getByRole('button', { name: 'Next view', exact: true })
  const left = await previous.boundingBox(),
    right = await next.boundingBox()
  expect(left!.height).toBe(32)
  expect(left!.y).toBe(right!.y)
  expect(right!.x - left!.x - left!.width).toBe(4)
  await next.click()
  await expect(
    card.getByRole('heading', { name: 'To-do', exact: true }),
  ).toBeVisible()
  await expect(card.getByRole('checkbox')).toHaveCount(10)
  for (const name of ['Overdue task', 'Future task', 'No date task']) {
    await expect(
      card.getByRole('checkbox', {
        name: `Mark ${name} as completed`,
        exact: true,
      }),
    ).toHaveCount(1)
  }
  await expect(card.getByText('Already done', { exact: true })).toHaveCount(0)
  const after = await card.boundingBox()
  expect(after!.height).toBe(before!.height)
  expect(after!.width).toBe(before!.width)
  const scroll = card.getByLabel('Incomplete tasks', { exact: true })
  expect(await scroll.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(
    true,
  )
  await page.screenshot({
    path: testInfo.outputPath('overview-todo.png'),
    fullPage: true,
    animations: 'disabled',
  })
  await page.reload()
  await expect(
    card.getByRole('heading', { name: 'To-do', exact: true }),
  ).toBeVisible()
  await expect(card.getByRole('checkbox')).toHaveCount(10)
  const checkbox = card.getByRole('checkbox', {
    name: 'Mark Overdue task as completed',
    exact: true,
  })
  await page.route(`**/api/tasks/${tasks[0].id}`, (route) =>
    route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ error: { message: 'Could not save task.' } }),
    }),
  )
  await checkbox.check()
  await expect(card.getByRole('alert')).toContainText('Could not save task.')
  await expect(checkbox).not.toBeChecked()
  await page.unroute(`**/api/tasks/${tasks[0].id}`)
  await checkbox.check()
  await expect(checkbox).toHaveCount(0)
  await expect(card.getByRole('checkbox')).toHaveCount(9)
  await card.getByRole('link', { name: 'View Planner', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Planner', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('checkbox', {
      name: 'Mark Overdue task as incomplete',
      exact: true,
    }),
  ).toBeChecked()
  await page.getByRole('link', { name: 'Overview', exact: true }).click()
  await expect(
    card.getByRole('heading', { name: 'To-do', exact: true }),
  ).toBeVisible()
  await previous.click()
  await expect(
    card.getByRole('heading', { name: 'My Space', exact: true }),
  ).toBeVisible()
  await next.click()
  await page.getByRole('button', { name: 'Log Out', exact: true }).click()
  const secondEmail = `carousel-other-${randomUUID()}@example.test`
  accountEmails.push(secondEmail)
  const other = await page.request.post('/api/auth/register', {
    headers: { Origin: origin },
    data: {
      name: 'Other Carousel User',
      email: secondEmail,
      password: 'Browser-test-password-123',
    },
  })
  expect(other.status()).toBe(201)
  await page.goto('/dashboard')
  await expect(
    card.getByRole('heading', { name: 'My Space', exact: true }),
  ).toBeVisible()
  await next.click()
  await expect(
    card.getByText('No incomplete tasks.', { exact: true }),
  ).toBeVisible()
  await expect(card.getByRole('checkbox')).toHaveCount(0)
  await page.reload()
  await expect(
    card.getByRole('heading', { name: 'To-do', exact: true }),
  ).toBeVisible()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
})

test('category budgets track actual spending without changing the monthly budget', async ({
  page,
}, testInfo) => {
  const email = `category-budgets-${randomUUID()}@example.test`
  accountEmails.push(email)
  const origin = 'http://127.0.0.1:5180'
  const registration = await page.request.post('/api/auth/register', {
    headers: { Origin: origin },
    data: {
      name: 'Category Budget Browser',
      email,
      password: 'Browser-test-password-123',
    },
  })
  expect(registration.status()).toBe(201)
  const { data: session } = await registration.json()
  const headers = { Origin: origin, 'X-CSRF-Token': session.csrfToken }
  const categories = (await (await page.request.get('/api/categories')).json())
    .data
  const food = categories.find(
    (category: { name: string }) => category.name === 'Food',
  )
  const custom = await page.request.post('/api/categories', {
    headers,
    data: { name: 'Hobbies', type: 'EXPENSE' },
  })
  expect(custom.status()).toBe(201)
  const customId = (await custom.json()).data.id
  expect(
    (
      await page.request.put('/api/budgets', {
        headers,
        data: { month: 2, year: 2024, amount: '500' },
      })
    ).status(),
  ).toBe(200)
  for (const [categoryId, amount, date] of [
    [food.id, '120.25', '2024-02-29'],
    [customId, '20', '2024-02-01'],
    [food.id, '99', '2024-03-01'],
  ]) {
    expect(
      (
        await page.request.post('/api/transactions', {
          headers,
          data: { type: 'EXPENSE', categoryId, amount, date },
        })
      ).status(),
    ).toBe(201)
  }
  await page.goto('/budgets?month=2024-02')
  const section = page.getByRole('region', {
    name: 'Category Budgets',
    exact: true,
  })
  await expect(
    section.getByText('No category budgets this month.', { exact: true }),
  ).toBeVisible()
  await section
    .getByRole('button', { name: 'Add Category Budget', exact: true })
    .click()
  let form = section.getByRole('form', {
    name: 'Add category budget',
    exact: true,
  })
  await form.getByLabel('Category', { exact: true }).selectOption(food.id)
  await form.getByLabel('Budget amount', { exact: true }).fill('100')
  await form.getByRole('button', { name: 'Save Budget', exact: true }).click()
  const foodCard = section.getByRole('article', {
    name: 'Food budget',
    exact: true,
  })
  await expect(foodCard).toContainText('$120.25 spent')
  await expect(foodCard).toContainText('of $100.00')
  await expect(foodCard).toContainText('$20.25 over budget')
  await expect(foodCard.getByRole('progressbar')).toHaveAttribute(
    'aria-valuenow',
    '100',
  )
  await section
    .getByRole('button', { name: 'Add Category Budget', exact: true })
    .click()
  form = section.getByRole('form', { name: 'Add category budget', exact: true })
  await expect(
    form.getByRole('option', { name: 'Food', exact: true }),
  ).toHaveCount(0)
  await form.getByLabel('Category', { exact: true }).selectOption(customId)
  await form.getByLabel('Budget amount', { exact: true }).fill('50')
  await form.getByRole('button', { name: 'Save Budget', exact: true }).click()
  const customCard = section.getByRole('article', {
    name: 'Hobbies budget',
    exact: true,
  })
  await expect(customCard).toContainText('$30.00 remaining')
  await expect(customCard.getByRole('progressbar')).toHaveAttribute(
    'aria-valuenow',
    '40',
  )
  await page.reload()
  await expect(foodCard).toContainText('$20.25 over budget')
  await foodCard
    .getByRole('button', { name: 'Edit Food budget', exact: true })
    .click()
  const edit = section.getByRole('form', {
    name: 'Edit category budget',
    exact: true,
  })
  await expect(edit.getByLabel('Category', { exact: true })).toBeDisabled()
  await edit.getByLabel('Budget amount', { exact: true }).fill('200')
  await edit.getByRole('button', { name: 'Save Budget', exact: true }).click()
  await expect(foodCard).toContainText('$79.75 remaining')
  const overall = page
    .getByRole('heading', { name: 'Monthly Spending Budget', exact: true })
    .locator('..')
  await expect(
    overall.getByLabel('Budget amount', { exact: true }),
  ).toHaveValue('500.00')
  await expect(overall).toContainText('$140.25 spent')
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
  await page.screenshot({
    path: testInfo.outputPath('category-budgets.png'),
    fullPage: true,
  })
  await page.getByLabel('Month', { exact: true }).fill('2024-03')
  await expect(section.getByRole('article')).toHaveCount(0)
  await expect(
    section.getByText('No category budgets this month.', { exact: true }),
  ).toBeVisible()
  await page.getByLabel('Month', { exact: true }).fill('2024-02')
  await expect(section.getByRole('article')).toHaveCount(2)
  await foodCard
    .getByRole('button', { name: 'Remove Food budget', exact: true })
    .click()
  await expect(foodCard).toHaveCount(0)
  await page.reload()
  await expect(section.getByRole('article')).toHaveCount(1)
  await expect(
    overall.getByLabel('Budget amount', { exact: true }),
  ).toHaveValue('500.00')
  await expect(overall).toContainText('$140.25 spent')
})
