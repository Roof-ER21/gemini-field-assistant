-- ============================================================================
-- SUSAN 21 FIELD AI - PostgreSQL Database Schema
-- ============================================================================
-- Created: 2025-11-02
-- Purpose: Centralized database for user data, analytics, and knowledge management
-- ============================================================================

-- Enable UUID extension for better primary keys
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- USERS TABLE
-- ============================================================================
-- Stores user accounts and authentication info
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255),
    role VARCHAR(50) DEFAULT 'sales_rep', -- sales_rep, manager, admin
    state VARCHAR(2), -- VA, MD, PA
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_login_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT TRUE
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_state ON users(state);

-- ============================================================================
-- CHAT HISTORY TABLE
-- ============================================================================
-- Stores all chat conversations with S21
CREATE TABLE IF NOT EXISTS chat_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    message_id VARCHAR(100) NOT NULL, -- Client-side message ID
    sender VARCHAR(20) NOT NULL, -- 'user' or 'bot'
    content TEXT NOT NULL,
    state VARCHAR(2), -- VA, MD, PA - state context at time of message
    provider VARCHAR(50), -- AI provider used (Gemini, DeepSeek, etc.)
    sources JSONB, -- Array of source documents used
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    session_id UUID -- Group messages by conversation session
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_chat_history_user_id ON chat_history(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_history_session_id ON chat_history(session_id);
CREATE INDEX IF NOT EXISTS idx_chat_history_created_at ON chat_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_history_state ON chat_history(state);

-- ============================================================================
-- DOCUMENT VIEWS TABLE
-- ============================================================================
-- Tracks which documents users view and how often
CREATE TABLE IF NOT EXISTS document_views (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    document_path VARCHAR(500) NOT NULL,
    document_name VARCHAR(255) NOT NULL,
    document_category VARCHAR(100),
    view_count INTEGER DEFAULT 1,
    first_viewed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_viewed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    total_time_spent INTEGER DEFAULT 0, -- Total seconds spent viewing
    UNIQUE(user_id, document_path)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_document_views_user_id ON document_views(user_id);
CREATE INDEX IF NOT EXISTS idx_document_views_last_viewed ON document_views(last_viewed_at DESC);
CREATE INDEX IF NOT EXISTS idx_document_views_category ON document_views(document_category);

-- ============================================================================
-- DOCUMENT FAVORITES TABLE
-- ============================================================================
-- User bookmarked documents
CREATE TABLE IF NOT EXISTS document_favorites (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    document_path VARCHAR(500) NOT NULL,
    document_name VARCHAR(255) NOT NULL,
    document_category VARCHAR(100),
    note TEXT, -- User's personal note about why they favorited it
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, document_path)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_document_favorites_user_id ON document_favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_document_favorites_created_at ON document_favorites(created_at DESC);

-- ============================================================================
-- EMAIL GENERATION LOG TABLE
-- ============================================================================
-- Track generated emails for analytics and improvement
CREATE TABLE IF NOT EXISTS email_generation_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    email_type VARCHAR(100), -- Template type used
    recipient_email VARCHAR(255),
    subject TEXT,
    body TEXT,
    context TEXT, -- Original context from chat
    state VARCHAR(2), -- VA, MD, PA
    was_sent BOOLEAN DEFAULT FALSE,
    was_edited BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_email_log_user_id ON email_generation_log(user_id);
CREATE INDEX IF NOT EXISTS idx_email_log_created_at ON email_generation_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_log_state ON email_generation_log(state);

-- ============================================================================
-- IMAGE ANALYSIS LOG TABLE
-- ============================================================================
-- Track image analysis requests
CREATE TABLE IF NOT EXISTS image_analysis_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    image_url TEXT,
    analysis_result TEXT,
    analysis_type VARCHAR(50), -- 'roof_damage', 'general', etc.
    provider VARCHAR(50), -- AI provider used
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_image_analysis_user_id ON image_analysis_log(user_id);
CREATE INDEX IF NOT EXISTS idx_image_analysis_created_at ON image_analysis_log(created_at DESC);

-- ============================================================================
-- USER PREFERENCES TABLE
-- ============================================================================
-- Store user preferences and settings
CREATE TABLE IF NOT EXISTS user_preferences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    preferred_state VARCHAR(2), -- Default state (VA, MD, PA)
    preferred_ai_provider VARCHAR(50), -- Preferred AI (Gemini, DeepSeek, etc.)
    theme VARCHAR(20) DEFAULT 'dark', -- UI theme
    notifications_enabled BOOLEAN DEFAULT TRUE,
    preferences JSONB, -- Flexible JSON for additional settings
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- SEARCH ANALYTICS TABLE
-- ============================================================================
-- Track what users search for to improve knowledge base
CREATE TABLE IF NOT EXISTS search_analytics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    query TEXT NOT NULL,
    results_count INTEGER,
    selected_document VARCHAR(500), -- Which document user clicked
    state VARCHAR(2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_search_analytics_user_id ON search_analytics(user_id);
CREATE INDEX IF NOT EXISTS idx_search_analytics_created_at ON search_analytics(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_search_analytics_query ON search_analytics USING gin(to_tsvector('english', query));

-- ============================================================================
-- RAG DOCUMENTS TABLE
-- ============================================================================
-- Stores document embeddings for RAG (Retrieval Augmented Generation)
-- This table enables semantic search and AI-powered document retrieval
CREATE TABLE IF NOT EXISTS rag_documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_name VARCHAR(500) NOT NULL,
    document_path VARCHAR(1000) NOT NULL,
    document_category VARCHAR(100),
    type VARCHAR(20) NOT NULL CHECK (type IN ('pdf', 'md', 'txt', 'docx', 'pptx', 'json', 'markdown', 'text', 'processed')),
    content TEXT NOT NULL,
    content_hash VARCHAR(64), -- SHA-256 hash for deduplication
    chunk_index INTEGER DEFAULT 0, -- For splitting large documents into chunks
    metadata JSONB, -- Flexible metadata (pages, size, author, etc.)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(document_path, chunk_index)
);

-- Indexes for efficient RAG queries
CREATE INDEX IF NOT EXISTS idx_rag_documents_path ON rag_documents(document_path);
CREATE INDEX IF NOT EXISTS idx_rag_documents_category ON rag_documents(document_category);
CREATE INDEX IF NOT EXISTS idx_rag_documents_hash ON rag_documents(content_hash);
CREATE INDEX IF NOT EXISTS idx_rag_documents_type ON rag_documents(type);
CREATE INDEX IF NOT EXISTS idx_rag_documents_created_at ON rag_documents(created_at DESC);

-- Full-text search index for RAG content
CREATE INDEX IF NOT EXISTS idx_rag_documents_content_search ON rag_documents
    USING gin(to_tsvector('english', content));

-- Note: For semantic embeddings (vector search), you would need:
-- 1. Enable pgvector extension: CREATE EXTENSION IF NOT EXISTS vector;
-- 2. Add embedding column: ALTER TABLE rag_documents ADD COLUMN embedding VECTOR(768);
-- 3. Create vector index: CREATE INDEX ON rag_documents USING ivfflat (embedding vector_cosine_ops);

-- ============================================================================
-- ANALYTICS SUMMARY VIEW
-- ============================================================================
-- Useful view for quick analytics
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

-- ============================================================================
-- POPULAR DOCUMENTS VIEW
-- ============================================================================
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

-- ============================================================================
-- TRIGGER: Update updated_at timestamp
-- ============================================================================
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

CREATE TRIGGER update_rag_documents_updated_at BEFORE UPDATE ON rag_documents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- SAMPLE DATA (for testing)
-- ============================================================================
-- INSURANCE COMPANIES (Directory)
-- Note: Critical for MapsPanel. Logged error indicated missing relation.
CREATE TABLE IF NOT EXISTS insurance_companies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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

CREATE INDEX IF NOT EXISTS idx_insurance_companies_name ON insurance_companies(name);
CREATE INDEX IF NOT EXISTS idx_insurance_companies_state ON insurance_companies(state);

-- Insert a test user
INSERT INTO users (email, name, role, state)
VALUES ('test@roofer.com', 'Test User', 'sales_rep', 'MD')
ON CONFLICT (email) DO NOTHING;

-- ============================================================================
-- DATABASE SETUP COMPLETE
-- ============================================================================
-- Run this file on Railway using:
-- railway run psql $DATABASE_URL -f database/schema.sql
-- ============================================================================
