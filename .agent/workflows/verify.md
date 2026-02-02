---
description: Run the full verification suite (lint, test, build, e2e)
---
# Verify Workflow

This workflow runs the complete verification process to ensure the project is in a releasable state.

1.  **Validate Code Quality and Unit Tests**
    This step runs the linter and unit tests. It is the fastest way to catch common errors.
    ```bash
    npm run validate
    ```

2.  **Build Project**
    Ensures the project builds without errors.
    ```bash
    npm run build
    ```

3.  **Run E2E Tests**
    Runs the full end-to-end test suite using Playwright.
    ```bash
    npm run test:e2e
    ```

> **Note**: If any step fails, stop and fix the issue before proceeding.
