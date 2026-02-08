#!/bin/bash

# Timezone Audit Verification Script
# Checks that all files are properly configured for Eastern timezone

echo "🔍 Storm Services Timezone Audit Verification"
echo "=============================================="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Counters
PASS=0
FAIL=0
WARN=0

# Check if file exists and contains pattern
check_file() {
    local file=$1
    local pattern=$2
    local description=$3

    if [ ! -f "$file" ]; then
        echo -e "${RED}✗${NC} MISSING: $file"
        ((FAIL++))
        return 1
    fi

    if grep -q "$pattern" "$file"; then
        echo -e "${GREEN}✓${NC} $description"
        ((PASS++))
        return 0
    else
        echo -e "${YELLOW}⚠${NC} WARNING: $description - pattern not found"
        ((WARN++))
        return 1
    fi
}

echo "📋 Checking Backend Services..."
echo "--------------------------------"

# NOAA Storm Service
check_file \
    "/Users/a21/gemini-field-assistant/server/services/noaaStormService.ts" \
    "timeZone: 'America/New_York'" \
    "noaaStormService.ts uses Eastern timezone"

# Hail Maps Service
check_file \
    "/Users/a21/gemini-field-assistant/server/services/hailMapsService.ts" \
    "timeZone: 'America/New_York'" \
    "hailMapsService.ts uses Eastern timezone"

# PDF Report Service
check_file \
    "/Users/a21/gemini-field-assistant/server/services/pdfReportService.ts" \
    "timeZone: 'America/New_York'" \
    "pdfReportService.ts uses Eastern timezone (FIXED)"

# Damage Score Service
check_file \
    "/Users/a21/gemini-field-assistant/server/services/damageScoreService.ts" \
    "new Date(" \
    "damageScoreService.ts exists and uses Date objects"

# Hot Zone Service
check_file \
    "/Users/a21/gemini-field-assistant/server/services/hotZoneService.ts" \
    "new Date(" \
    "hotZoneService.ts exists and uses Date objects"

echo ""
echo "📦 Checking New Frontend Files..."
echo "--------------------------------"

# Storm API Service
check_file \
    "/Users/a21/gemini-field-assistant/services/stormApi.ts" \
    "class StormApiClient" \
    "stormApi.ts created with API client"

check_file \
    "/Users/a21/gemini-field-assistant/services/stormApi.ts" \
    "searchHail" \
    "stormApi.ts has searchHail method"

check_file \
    "/Users/a21/gemini-field-assistant/services/stormApi.ts" \
    "getDamageScore" \
    "stormApi.ts has getDamageScore method"

check_file \
    "/Users/a21/gemini-field-assistant/services/stormApi.ts" \
    "getHotZones" \
    "stormApi.ts has getHotZones method"

check_file \
    "/Users/a21/gemini-field-assistant/services/stormApi.ts" \
    "generateReport" \
    "stormApi.ts has generateReport method"

# Timezone Utilities
check_file \
    "/Users/a21/gemini-field-assistant/utils/timezone.ts" \
    "toEasternDate" \
    "timezone.ts has toEasternDate function"

check_file \
    "/Users/a21/gemini-field-assistant/utils/timezone.ts" \
    "formatEasternDate" \
    "timezone.ts has formatEasternDate function"

check_file \
    "/Users/a21/gemini-field-assistant/utils/timezone.ts" \
    "America/New_York" \
    "timezone.ts uses Eastern timezone constant"

echo ""
echo "📄 Checking Documentation..."
echo "-----------------------------"

# Audit Report
check_file \
    "/Users/a21/gemini-field-assistant/STORM_TIMEZONE_AUDIT.md" \
    "Timezone Audit Report" \
    "Audit report created"

# API Guide
check_file \
    "/Users/a21/gemini-field-assistant/docs/STORM_API_GUIDE.md" \
    "Storm API Usage Guide" \
    "API usage guide created"

# Summary
check_file \
    "/Users/a21/gemini-field-assistant/TIMEZONE_AUDIT_SUMMARY.md" \
    "Timezone Audit - Summary" \
    "Audit summary created"

echo ""
echo "🔧 Checking TypeScript Exports..."
echo "---------------------------------"

# Check exports in stormApi.ts
check_file \
    "/Users/a21/gemini-field-assistant/services/stormApi.ts" \
    "export const stormApi" \
    "stormApi exported as singleton"

check_file \
    "/Users/a21/gemini-field-assistant/services/stormApi.ts" \
    "export interface SearchParams" \
    "SearchParams interface exported"

check_file \
    "/Users/a21/gemini-field-assistant/services/stormApi.ts" \
    "export interface DamageScoreResult" \
    "DamageScoreResult interface exported"

# Check exports in timezone.ts
check_file \
    "/Users/a21/gemini-field-assistant/utils/timezone.ts" \
    "export const toEasternDate" \
    "toEasternDate exported"

check_file \
    "/Users/a21/gemini-field-assistant/utils/timezone.ts" \
    "export const formatEasternDate" \
    "formatEasternDate exported"

echo ""
echo "=============================================="
echo "📊 Verification Summary"
echo "=============================================="
echo -e "${GREEN}✓ Passed: $PASS${NC}"
echo -e "${YELLOW}⚠ Warnings: $WARN${NC}"
echo -e "${RED}✗ Failed: $FAIL${NC}"
echo ""

# Calculate total
TOTAL=$((PASS + WARN + FAIL))
SCORE=$((PASS * 100 / TOTAL))

echo "Score: $SCORE% ($PASS/$TOTAL checks passed)"
echo ""

if [ $FAIL -gt 0 ]; then
    echo -e "${RED}❌ AUDIT INCOMPLETE - Fix failed checks${NC}"
    exit 1
elif [ $WARN -gt 0 ]; then
    echo -e "${YELLOW}⚠️  AUDIT COMPLETE WITH WARNINGS${NC}"
    exit 0
else
    echo -e "${GREEN}✅ AUDIT COMPLETE - All checks passed!${NC}"
    exit 0
fi
