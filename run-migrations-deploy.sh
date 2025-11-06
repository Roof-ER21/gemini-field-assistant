#!/bin/bash
# This script will be run on Railway deployment
echo "Running database migrations..."
node run-migrations.js
