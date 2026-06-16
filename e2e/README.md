# Playwright E2E

Tests live in `e2e/`. They run against a real preview/published URL with real auth, so they require test accounts.

## Setup

```bash
bunx playwright install chromium
export BASE_URL=https://<your-preview>.lovable.app
export E2E_USER_EMAIL=tester@example.com
export E2E_USER_PASSWORD=********
# Optional second account for mention test:
export E2E_USER2_EMAIL=tester2@example.com
export E2E_USER2_PASSWORD=********
```

## Run

```bash
bunx playwright test
bunx playwright test --headed              # watch in a browser
bunx playwright test e2e/collab.spec.ts -g "refresh"
```

Tests are skipped automatically when the required env vars are missing.
