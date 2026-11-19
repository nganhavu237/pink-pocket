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
