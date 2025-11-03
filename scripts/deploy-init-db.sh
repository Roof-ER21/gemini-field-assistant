#!/bin/bash

# Deploy Database Initialization Script to Railway
# This script will be run once on Railway to initialize the database

echo "🚀 Deploying database initialization to Railway..."

# Create a temporary init script that will run on Railway
cat > /tmp/railway-db-init.js << 'INITSCRIPT'
import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const schema = `
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255),
    role VARCHAR(50) DEFAULT 'sales_rep',
    state VARCHAR(2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_login_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_state ON users(state);

-- Chat history table
CREATE TABLE IF NOT EXISTS chat_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    message_id VARCHAR(100) NOT NULL,
    sender VARCHAR(20) NOT NULL,
    content TEXT NOT NULL,
    state VARCHAR(2),
    provider VARCHAR(50),
    sources JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    session_id UUID
);

CREATE INDEX IF NOT EXISTS idx_chat_history_user_id ON chat_history(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_history_session_id ON chat_history(session_id);
CREATE INDEX IF NOT EXISTS idx_chat_history_created_at ON chat_history(created_at DESC);

-- Document views table
CREATE TABLE IF NOT EXISTS document_views (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    document_path VARCHAR(500) NOT NULL,
    document_name VARCHAR(255) NOT NULL,
    document_category VARCHAR(100),
    view_count INTEGER DEFAULT 1,
    first_viewed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_viewed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    total_time_spent INTEGER DEFAULT 0,
    UNIQUE(user_id, document_path)
);

CREATE INDEX IF NOT EXISTS idx_document_views_user_id ON document_views(user_id);
CREATE INDEX IF NOT EXISTS idx_document_views_last_viewed ON document_views(last_viewed_at DESC);

-- Document favorites table
CREATE TABLE IF NOT EXISTS document_favorites (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    document_path VARCHAR(500) NOT NULL,
    document_name VARCHAR(255) NOT NULL,
    document_category VARCHAR(100),
    note TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, document_path)
);

CREATE INDEX IF NOT EXISTS idx_document_favorites_user_id ON document_favorites(user_id);

-- Email generation log table
CREATE TABLE IF NOT EXISTS email_generation_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    email_type VARCHAR(100),
    recipient_email VARCHAR(255),
    subject TEXT,
    body TEXT,
    context TEXT,
    state VARCHAR(2),
    was_sent BOOLEAN DEFAULT FALSE,
    was_edited BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_email_log_user_id ON email_generation_log(user_id);

-- Image analysis log table
CREATE TABLE IF NOT EXISTS image_analysis_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    image_url TEXT,
    analysis_result TEXT,
    analysis_type VARCHAR(50),
    provider VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_image_analysis_user_id ON image_analysis_log(user_id);

-- User preferences table
CREATE TABLE IF NOT EXISTS user_preferences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    preferred_state VARCHAR(2),
    preferred_ai_provider VARCHAR(50),
    theme VARCHAR(20) DEFAULT 'dark',
    notifications_enabled BOOLEAN DEFAULT TRUE,
    preferences JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Search analytics table
CREATE TABLE IF NOT EXISTS search_analytics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    query TEXT NOT NULL,
    results_count INTEGER,
    selected_document VARCHAR(500),
    state VARCHAR(2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_search_analytics_user_id ON search_analytics(user_id);

-- Analytics views
CREATE OR REPLACE VIEW user_activity_summary AS
SELECT
    u.id as user_id,
    u.email,
    u.name,
    u.state,
    COUNT(DISTINCT ch.id) as total_messages,
    COUNT(DISTINCT dv.document_path) as unique_documents_viewed,
    COUNT(DISTINCT df.document_path) as favorite_documents,
    COUNT(DISTINCT eg.id) as emails_generated,
    COUNT(DISTINCT ia.id) as images_analyzed,
    MAX(u.last_login_at) as last_active
FROM users u
LEFT JOIN chat_history ch ON u.id = ch.user_id
LEFT JOIN document_views dv ON u.id = dv.user_id
LEFT JOIN document_favorites df ON u.id = df.user_id
LEFT JOIN email_generation_log eg ON u.id = eg.user_id
LEFT JOIN image_analysis_log ia ON u.id = ia.user_id
GROUP BY u.id, u.email, u.name, u.state;

CREATE OR REPLACE VIEW popular_documents AS
SELECT
    document_path,
    document_name,
    document_category,
    COUNT(DISTINCT user_id) as unique_viewers,
    SUM(view_count) as total_views,
    AVG(total_time_spent) as avg_time_spent,
    MAX(last_viewed_at) as last_viewed
FROM document_views
GROUP BY document_path, document_name, document_category
ORDER BY total_views DESC;

-- Trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_preferences_updated_at BEFORE UPDATE ON user_preferences
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Test user
INSERT INTO users (email, name, role, state)
VALUES ('test@roofer.com', 'Test User', 'sales_rep', 'MD')
ON CONFLICT (email) DO NOTHING;
`;

async function init() {
  try {
    console.log('🔗 Connecting to database...');
    await pool.query(schema);
    console.log('✅ Schema executed successfully');

    const tables = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'");
    console.log('✅ Tables:', tables.rows.map(r => r.table_name).join(', '));

    await pool.end();
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err);
    process.exit(1);
  }
}

init();
INITSCRIPT

# Upload and run the init script on Railway
echo "📤 Uploading initialization script..."
railway up --detach

echo "✅ Database initialization deployed to Railway"
echo "Check Railway logs with: railway logs"
