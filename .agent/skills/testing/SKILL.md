---
name: testing
description: Guidelines and instructions for writing valuable unit and integration tests in the Gig-Dex project.
license: MIT
---

# Testing Strategy

This project prioritizes high-value tests that ensure functional correctness without excessive mocking.

## Core Principles

1.  **Value over Volume**: Focus on testing complex logic, data transformations, and critical workflows.
2.  **Avoid Over-Mocking**: Do not mock internal implementation details or helper functions that have no side effects (pure functions).
3.  **Integration for Logic**: Use actual implementations for database (via `fake-indexeddb`) and utility functions to verify they work together correctly.
4.  **Mocking Side Effects**: Mock external APIs, timers, or browser features that are not available in the test environment.
5.  **Coverage Goals**: Aim for 100% coverage of core business logic (e.g., `chordEngine.ts`, `db.ts`).

## Test Environment

- **Test Runner**: Vitest
- **DOM Environment**: JSDOM (for component tests)
- **Database**: `fake-indexeddb`
- **Utilities**: `chordsheetjs`

## How to Write Tests

### Utility Tests (`.test.ts`)
For pure logic like chord transposition or parsing:
```typescript
import { it, expect, describe } from 'vitest';
import { someUtil } from './someUtil';

describe('someUtil', () => {
    it('should do X when Y', () => {
        const result = someUtil('input');
        expect(result).toBe('expected');
    });
});
```

### Database Tests (`src/db.test.ts`)
We use `fake-indexeddb` so we can test the actual database logic:
```typescript
import { beforeEach, it, expect, describe } from 'vitest';
import { initDB, addSong } from './db';

describe('Database', () => {
    it('should store and retrieve data', async () => {
        const id = await addSong({ title: 'Test', ... });
        expect(id).toBeDefined();
    });
});
```

### Component Tests (`.test.tsx`)
Use React Testing Library:
```typescript
import { render, screen, fireEvent } from '@testing-library/react';
import { MyComponent } from './MyComponent';

it('should handle user interaction', () => {
    render(<MyComponent />);
    fireEvent.click(screen.getByRole('button'));
    // assertions...
});
```

## Running Tests

- **Run all tests**: `npm run test`
- **Watch mode**: `npm run test:watch`
- **Coverage report**: `npm run test:coverage`
