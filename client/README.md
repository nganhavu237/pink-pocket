# Pink Pocket client

React + TypeScript + Vite frontend. See the [project README](../README.md) for local
setup, environment variables, API documentation, and test commands.

- `src/components/`: shared navigation, forms, transaction lists, charts, and feedback.
- `src/pages/`: landing, authentication, overview, transactions, budgets, analytics, settings.
- `src/contexts/`, `src/hooks/`: cookie session state and cancellable API reads.
- `src/services/api.ts`: credentialed API requests and in-memory CSRF token.
- `src/types/`, `src/utils/`: API contracts and exact money/date display.
- `e2e/`: desktop/mobile browser workflow tests against the dedicated test database.

Run `npm run dev` with the API running. `/api` is proxied to port 3001. The existing
pink, white, lavender, sage, and blue theme is defined in `src/index.css`.
