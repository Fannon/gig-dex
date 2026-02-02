---
name: validate
description: Run mandatory validation (linting + unit tests). Use this frequently during development to ensure code quality.
license: MIT
---

# Validate Codebase

This skill executes the project's mandatory validation suite.

## Instructions

To validate the current state of the codebase, run:

```bash
npm run validate
```

If you encounter linting errors that are fixable, you can run:

```bash
npm run lint:fix
```

## Context
- **Linter**: Biome
- **Test Runner**: Vitest
- **Config**: `package.json` scripts `validate`
