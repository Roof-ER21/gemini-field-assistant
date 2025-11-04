/**
 * Database Migration Script
 * Runs automatically on Railway startup to fix constraints and update schema
 */

import pg from 'pg';
const { Pool } = pg;

const DATABASE_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL;

if (!DATABASE_URL) {
  console.log('⚠️  No DATABASE_URL found, skipping migrations');
  process.exit(0);
}

console.log('🔄 Running database migrations...');

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL.includes('railway') ? { rejectUnauthorized: false } : false
});

async function runMigrations() {
  const client = await pool.connect();

  try {
    console.log('✓ Connected to database');

    // Migration 1: Fix RAG documents constraint
    console.log('📝 Migration 1: Fixing rag_documents constraint...');
    try {
      await client.query(`
        ALTER TABLE IF EXISTS rag_documents
        DROP CONSTRAINT IF EXISTS rag_documents_type_check;
      `);

      await client.query(`
        ALTER TABLE IF EXISTS rag_documents
        ADD CONSTRAINT rag_documents_type_check
        CHECK (type IN ('pdf', 'md', 'txt', 'docx', 'pptx', 'json', 'markdown', 'text'));
      `);

      console.log('✅ RAG documents constraint fixed');
    } catch (error) {
      if (error.code === '42P01') {
        // Table doesn't exist yet
        console.log('⚠️  rag_documents table does not exist yet (will be created)');
      } else {
        console.warn('⚠️  Could not update rag_documents constraint:', error.message);
      }
    }

    // Migration 2: Ensure rag_documents table exists
    console.log('📝 Migration 2: Ensuring rag_documents table exists...');
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS rag_documents (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name VARCHAR(500) NOT NULL,
          path VARCHAR(1000) NOT NULL UNIQUE,
          type VARCHAR(50) NOT NULL CHECK (type IN ('pdf', 'md', 'txt', 'docx', 'pptx', 'json', 'markdown', 'text')),
          content_hash VARCHAR(64) UNIQUE,
          category VARCHAR(100),
          metadata JSONB DEFAULT '{}'::jsonb,
          content TEXT,
          chunk_count INTEGER DEFAULT 0,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_rag_documents_type ON rag_documents(type);
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_rag_documents_category ON rag_documents(category);
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_rag_documents_path ON rag_documents(path);
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_rag_documents_updated_at ON rag_documents(updated_at DESC);
      `);

      console.log('✅ rag_documents table ensured');
    } catch (error) {
      console.warn('⚠️  Could not create rag_documents table:', error.message);
    }

    // Migration 3: Ensure rag_chunks table exists
    console.log('📝 Migration 3: Ensuring rag_chunks table exists...');
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS rag_chunks (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          document_id UUID REFERENCES rag_documents(id) ON DELETE CASCADE,
          chunk_index INTEGER NOT NULL,
          content TEXT NOT NULL,
          embedding vector(768),
          token_count INTEGER,
          metadata JSONB DEFAULT '{}'::jsonb,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(document_id, chunk_index)
        );
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_rag_chunks_document_id ON rag_chunks(document_id);
      `);

      console.log('✅ rag_chunks table ensured');
    } catch (error) {
      console.warn('⚠️  Could not create rag_chunks table:', error.message);
    }

    // Migration 4: Ensure insurance_companies table exists
    console.log('📝 Migration 4: Ensuring insurance_companies table exists...');
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS insurance_companies (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name VARCHAR(255) NOT NULL,
          state VARCHAR(2) NOT NULL,
          phone VARCHAR(20),
          email VARCHAR(255),
          address TEXT,
          website VARCHAR(255),
          notes TEXT,
          category VARCHAR(50),
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(name)
        );
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_insurance_companies_name ON insurance_companies(name);
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_insurance_companies_state ON insurance_companies(state);
      `);

      console.log('✅ insurance_companies table ensured');
    } catch (error) {
      console.warn('⚠️  Could not create insurance_companies table:', error.message);
    }

    console.log('✅ All migrations completed successfully');

  } catch (error) {
    console.error('❌ Migration error:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

runMigrations()
  .then(() => {
    console.log('🎉 Database migrations finished');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  });
