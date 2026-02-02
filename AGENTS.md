# Agent Guide for Gig-Dex

This file guides agents (Antigravity, Claude, etc.) on how to work with this project effectively.

## Project Overview
**Gig-Dex** is a web application for musicians to manage gigs/songs.

### Technology Stack
- **Framework**: React + Vite (TypeScript)
- **Styling**: SCSS / CSS Modules
- **State/Storage**: IndexedDB (idb)
- **Quality**: Biome (Lint/Format), Vitest (Unit), Playwright (E2E)

## Verification Loop (MANDATORY)
We strictly enforce code quality. You must verify your changes.

### 1. Fast & Mandatory (`validate`)
Run this after *every* meaningful code change or feature implementation:
```bash
npm run validate
```
This runs:
- `biome check`: Lints and checks formatting.
- `vitest run`: Runs unit `tests`.

### 2. Full Verification (`verify`)
Run this before declaring a task "DONE" or when touching critical paths:
```bash
npm run verify
```
This runs `validate` plus:
- `vite build`: Ensures valid build.
- `playwright test`: Runs E2E tests.

## Common Commands
- **Start Server**: `npm run dev`
- **Fix Lint**: `npm run lint:fix`
- **Format**: `npm run format`
- **Unit Test**: `npm run test`
- **E2E Test**: `npm run test:e2e`

## Directory Structure
- `src/`: Source code.
- `e2e/`: Playwright E2E tests.
- `reports/`: Test reports.
- `.agent/`: Agent configuration.
  - `skills/`: Specialized capabilities (e.g., `validate`).
  - `workflows/`: Standard procedures (e.g., `verify`).

## Agent Skills & Workflows
- **Workflows**: stored in `.agent/workflows/`. Use `/verify` to run the full verification suite.
- **Skills**: stored in `.agent/skills/`. Read `SKILL.md` in subdirectories for instructions.
- **Validate Skill**: See `.agent/skills/validate/SKILL.md` for details on the mandatory validation loop.
