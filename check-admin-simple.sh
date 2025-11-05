#!/bin/bash
# Simple script to check admin role in Railway PostgreSQL

# Load environment variables from .env.local
if [ -f .env.local ]; then
    export $(grep -v '^#' .env.local | grep DATABASE_URL | xargs)
    export $(grep -v '^#' .env.local | grep EMAIL_ADMIN_ADDRESS | xargs)
fi

if [ -z "$DATABASE_URL" ]; then
    echo "❌ DATABASE_URL not found in .env.local"
    echo "Please set DATABASE_URL in .env.local file"
    exit 1
fi

echo "🔍 Checking Railway PostgreSQL database..."
echo ""
echo "📧 CONFIGURED ADMIN EMAIL: ${EMAIL_ADMIN_ADDRESS:-NOT SET}"
echo ""
echo "👥 ALL USERS IN DATABASE:"
echo "================================================================================"

psql "$DATABASE_URL" -c "SELECT 
    CASE WHEN role = 'admin' THEN '👑' ELSE '📋' END as icon,
    email, 
    name, 
    role, 
    state,
    to_char(created_at, 'YYYY-MM-DD HH24:MI') as created
FROM users 
ORDER BY created_at DESC;"

echo ""
echo "================================================================================"
echo "👑 ADMIN USERS:"
echo "================================================================================"

psql "$DATABASE_URL" -c "SELECT email, name, role, id FROM users WHERE role = 'admin';"

if [ ! -z "$EMAIL_ADMIN_ADDRESS" ]; then
    echo ""
    echo "================================================================================"
    echo "🔍 CHECKING CONFIGURED ADMIN EMAIL: $EMAIL_ADMIN_ADDRESS"
    echo "================================================================================"
    
    psql "$DATABASE_URL" -c "SELECT 
        email, 
        name, 
        role,
        CASE 
            WHEN role = 'admin' THEN '✅ HAS ADMIN ROLE'
            ELSE '❌ MISSING ADMIN ROLE - NEEDS FIX'
        END as status
    FROM users 
    WHERE LOWER(email) = LOWER('$EMAIL_ADMIN_ADDRESS');"
    
    echo ""
    echo "🔧 SQL FIX COMMAND (if needed):"
    echo "UPDATE users SET role = 'admin' WHERE LOWER(email) = LOWER('$EMAIL_ADMIN_ADDRESS');"
fi

echo ""
