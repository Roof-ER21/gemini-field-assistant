# Recommended package.json Test Scripts

Add these scripts to your `package.json` for easy test execution:

```json
{
  "scripts": {
    // Existing scripts...

    // Test Scripts - Add these:
    "test": "vitest",
    "test:ui": "vitest --ui",
    "test:coverage": "vitest --coverage",
    "test:watch": "vitest --watch",

    // Inspection Presentation Specific Tests
    "test:inspections": "vitest inspectionPresentationRoutes.test.ts",
    "test:inspections:coverage": "vitest inspectionPresentationRoutes.test.ts --coverage",
    "test:inspections:watch": "vitest inspectionPresentationRoutes.test.ts --watch",
    "test:inspections:ci": "vitest inspectionPresentationRoutes.test.ts --coverage --reporter=verbose --reporter=json --outputFile=test-results.json",

    // Alternative: Use the shell script
    "test:inspections:all": "./run-inspection-tests.sh all",
    "test:inspections:cov": "./run-inspection-tests.sh coverage"
  }
}
```

## Usage Examples

### Run all tests in the project
```bash
npm test
```

### Run with UI (interactive)
```bash
npm run test:ui
```

### Run with coverage
```bash
npm run test:coverage
```

### Watch mode for development
```bash
npm run test:watch
```

### Inspection presentation tests only
```bash
npm run test:inspections
```

### Inspection tests with coverage
```bash
npm run test:inspections:coverage
```

### Watch mode for inspection tests
```bash
npm run test:inspections:watch
```

### CI/CD mode
```bash
npm run test:inspections:ci
```

## Current package.json

Your current `package.json` has these scripts:
```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build && npm run server:build",
    "start": "node dist-server/index.js",
    "preview": "vite preview",
    "server:dev": "tsx watch server/index.ts",
    "server:build": "tsc -p tsconfig.server.json",
    "db:init": "node scripts/init-database.js",
    // ... other scripts
  }
}
```

## Recommended Addition

Add the test scripts above to enable:
- `npm test` - Run all tests
- `npm run test:inspections` - Run inspection presentation tests only
- `npm run test:coverage` - Generate coverage report

## CI/CD Integration

### GitHub Actions
```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm install
      - run: npm run test:inspections:ci
      - uses: codecov/codecov-action@v3
        with:
          files: ./coverage/lcov.info
```

### Railway Deploy
```yaml
# railway.json
{
  "build": {
    "builder": "NIXPACKS",
    "buildCommand": "npm install && npm run build"
  },
  "deploy": {
    "startCommand": "npm start",
    "healthcheckPath": "/api/health",
    "healthcheckTimeout": 100,
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  },
  "environments": {
    "production": {
      "env": {
        "NODE_ENV": "production"
      }
    }
  }
}
```

## Pre-commit Hook (Optional)

Add Husky to run tests before commits:

```bash
npm install -D husky
npx husky init
```

Create `.husky/pre-commit`:
```bash
#!/bin/sh
npm run test:inspections
```

This ensures all tests pass before allowing commits.

## Coverage Thresholds

Add to `vitest.config.ts`:

```typescript
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      thresholds: {
        lines: 95,
        functions: 95,
        branches: 90,
        statements: 95,
      },
    },
  },
});
```

This will fail tests if coverage drops below thresholds.
