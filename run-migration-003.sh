#!/bin/bash

# Get DATABASE_URL from Railway
export DATABASE_URL=$(railway variables get DATABASE_URL 2>/dev/null)

if [ -z "$DATABASE_URL" ]; then
  echo "❌ Could not get DATABASE_URL from Railway"
  exit 1
fi

echo "✅ Got DATABASE_URL from Railway"
echo "🔄 Running migration 003_analytics_and_monitoring.sql..."

psql "$DATABASE_URL" -f database/migrations/003_analytics_and_monitoring.sql

if [ $? -eq 0 ]; then
  echo "✅ Migration completed successfully!"
else
  echo "❌ Migration failed"
  exit 1
fi
