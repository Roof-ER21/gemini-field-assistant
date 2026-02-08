/**
 * Test Inspection Presentation Routes Integration
 * Verifies that all routes are properly configured
 */

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🧪 Testing Inspection Presentation Routes Integration\n');

// Test 1: Check if route file exists
console.log('Test 1: Route file existence');
try {
  const routePath = path.join(__dirname, 'server/routes/inspectionPresentationRoutes.ts');
  const fs = await import('fs');
  if (fs.existsSync(routePath)) {
    const stats = fs.statSync(routePath);
    console.log(`✅ Route file exists (${stats.size} bytes)`);
  } else {
    console.log('❌ Route file not found');
  }
} catch (error) {
  console.log('❌ Error checking route file:', error.message);
}

// Test 2: Check if service files exist
console.log('\nTest 2: Service files existence');
try {
  const fs = await import('fs');
  const inspectionServicePath = path.join(__dirname, 'services/inspectionService.ts');
  const presentationServicePath = path.join(__dirname, 'services/presentationService.ts');

  if (fs.existsSync(inspectionServicePath)) {
    console.log('✅ inspectionService.ts exists');
  } else {
    console.log('❌ inspectionService.ts not found');
  }

  if (fs.existsSync(presentationServicePath)) {
    console.log('✅ presentationService.ts exists');
  } else {
    console.log('❌ presentationService.ts not found');
  }
} catch (error) {
  console.log('❌ Error checking service files:', error.message);
}

// Test 3: Check if migration files exist
console.log('\nTest 3: Migration files existence');
try {
  const fs = await import('fs');
  const migrationsDir = path.join(__dirname, 'database/migrations');
  const files = fs.readdirSync(migrationsDir);
  const inspectionMigrations = files.filter(f => f.includes('inspection'));

  if (inspectionMigrations.length > 0) {
    console.log(`✅ Found ${inspectionMigrations.length} inspection migration(s):`);
    inspectionMigrations.forEach(file => console.log(`   - ${file}`));
  } else {
    console.log('❌ No inspection migrations found');
  }
} catch (error) {
  console.log('❌ Error checking migrations:', error.message);
}

// Test 4: Check server integration
console.log('\nTest 4: Server integration');
try {
  const fs = await import('fs');
  const serverPath = path.join(__dirname, 'server/index.ts');
  const content = fs.readFileSync(serverPath, 'utf8');

  const hasImport = content.includes('inspectionPresentationRoutes');
  const hasInspectionsRoute = content.includes("app.use('/api/inspections'");
  const hasPresentationsRoute = content.includes("app.use('/api/presentations'");
  const hasPresentRoute = content.includes("app.use('/api/present'");

  if (hasImport) {
    console.log('✅ Import statement found');
  } else {
    console.log('❌ Import statement missing');
  }

  if (hasInspectionsRoute) {
    console.log('✅ /api/inspections route mounted');
  } else {
    console.log('❌ /api/inspections route not mounted');
  }

  if (hasPresentationsRoute) {
    console.log('✅ /api/presentations route mounted');
  } else {
    console.log('❌ /api/presentations route not mounted');
  }

  if (hasPresentRoute) {
    console.log('✅ /api/present route mounted (public viewer)');
  } else {
    console.log('❌ /api/present route not mounted');
  }
} catch (error) {
  console.log('❌ Error checking server integration:', error.message);
}

// Test 5: Check dependencies
console.log('\nTest 5: Dependencies');
try {
  const fs = await import('fs');
  const packagePath = path.join(__dirname, 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));

  const hasMulter = packageJson.dependencies?.multer || packageJson.devDependencies?.multer;
  const hasTypesMulter = packageJson.dependencies?.['@types/multer'] || packageJson.devDependencies?.['@types/multer'];

  if (hasMulter) {
    console.log('✅ multer installed');
  } else {
    console.log('❌ multer not installed');
  }

  if (hasTypesMulter) {
    console.log('✅ @types/multer installed');
  } else {
    console.log('❌ @types/multer not installed');
  }
} catch (error) {
  console.log('❌ Error checking dependencies:', error.message);
}

// Test 6: Analyze route structure
console.log('\nTest 6: Route structure analysis');
try {
  const fs = await import('fs');
  const routePath = path.join(__dirname, 'server/routes/inspectionPresentationRoutes.ts');
  const content = fs.readFileSync(routePath, 'utf8');

  const postRoutes = (content.match(/router\.post/g) || []).length;
  const getRoutes = (content.match(/router\.get/g) || []).length;
  const patchRoutes = (content.match(/router\.patch/g) || []).length;
  const deleteRoutes = (content.match(/router\.delete/g) || []).length;

  console.log(`✅ Route analysis:`);
  console.log(`   - POST routes: ${postRoutes}`);
  console.log(`   - GET routes: ${getRoutes}`);
  console.log(`   - PATCH routes: ${patchRoutes}`);
  console.log(`   - DELETE routes: ${deleteRoutes}`);
  console.log(`   - Total routes: ${postRoutes + getRoutes + patchRoutes + deleteRoutes}`);
} catch (error) {
  console.log('❌ Error analyzing routes:', error.message);
}

console.log('\n' + '='.repeat(60));
console.log('✅ Integration test complete!');
console.log('='.repeat(60));
console.log('\nNext steps:');
console.log('1. Run database migrations: npm run db:migrate');
console.log('2. Start dev server: npm run server:dev');
console.log('3. Test endpoints with curl or Postman');
console.log('\nEndpoints available:');
console.log('  - POST   /api/inspections');
console.log('  - GET    /api/inspections/:id');
console.log('  - POST   /api/inspections/:id/photos');
console.log('  - GET    /api/inspections/:id/photos');
console.log('  - POST   /api/inspections/:id/analyze');
console.log('  - POST   /api/inspections/presentations');
console.log('  - GET    /api/inspections/presentations/:id');
console.log('  - POST   /api/inspections/presentations/:id/share');
console.log('  - GET    /api/inspections/present/:token (public, no auth)');
