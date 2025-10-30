#!/bin/bash

# Gemini Field Assistant - API Key Setup Helper Script
# This script helps you quickly set up your Gemini API key

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Print functions
print_header() {
    echo ""
    echo "============================================================"
    echo -e "${CYAN}$1${NC}"
    echo "============================================================"
    echo ""
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ $1${NC}"
}

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    print_error "Error: package.json not found"
    print_info "Please run this script from the project root directory"
    exit 1
fi

if [ ! -f "vite.config.ts" ]; then
    print_error "Error: vite.config.ts not found"
    print_info "This doesn't appear to be the Gemini Field Assistant project"
    exit 1
fi

print_header "Gemini Field Assistant - API Key Setup"

echo "This script will help you configure your Gemini API key."
echo ""

# Check if .env.local already exists
if [ -f ".env.local" ]; then
    print_warning ".env.local already exists"

    # Check current key
    CURRENT_KEY=$(grep "GEMINI_API_KEY=" .env.local | cut -d '=' -f2)

    if [ "$CURRENT_KEY" = "PLACEHOLDER_API_KEY" ]; then
        print_info "Current key is still the placeholder"
        echo ""
        read -p "Do you want to update it? (y/n): " -n 1 -r
        echo ""
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            print_info "Setup cancelled"
            exit 0
        fi
    else
        MASKED_KEY="${CURRENT_KEY:0:10}...${CURRENT_KEY: -4}"
        print_info "Current key: $MASKED_KEY"
        echo ""
        read -p "Do you want to replace it? (y/n): " -n 1 -r
        echo ""
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            print_info "Setup cancelled"
            exit 0
        fi
    fi
fi

# Instructions for getting API key
print_header "Step 1: Get Your Gemini API Key"

echo "To get your Gemini API key:"
echo "1. Visit: https://aistudio.google.com/apikey"
echo "2. Sign in with your Google account"
echo "3. Click 'Create API Key' or 'Get API Key'"
echo "4. Copy the generated key (starts with 'AIzaSy...')"
echo ""

# Option to open browser
read -p "Would you like to open the API key page in your browser? (y/n): " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    if command -v open &> /dev/null; then
        open "https://aistudio.google.com/apikey"
        print_success "Browser opened"
    elif command -v xdg-open &> /dev/null; then
        xdg-open "https://aistudio.google.com/apikey"
        print_success "Browser opened"
    else
        print_warning "Could not open browser automatically"
        print_info "Please visit: https://aistudio.google.com/apikey"
    fi
fi

echo ""
print_header "Step 2: Enter Your API Key"

# Prompt for API key
while true; do
    read -p "Enter your Gemini API key: " API_KEY

    # Validate the key
    if [ -z "$API_KEY" ]; then
        print_error "API key cannot be empty"
        continue
    fi

    if [ "$API_KEY" = "PLACEHOLDER_API_KEY" ]; then
        print_error "Please enter your actual API key, not the placeholder"
        continue
    fi

    if [[ ! $API_KEY =~ ^AIzaSy ]]; then
        print_warning "API key should start with 'AIzaSy'"
        read -p "Continue anyway? (y/n): " -n 1 -r
        echo ""
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            continue
        fi
    fi

    if [ ${#API_KEY} -ne 39 ]; then
        print_warning "API key should be 39 characters long (found ${#API_KEY})"
        read -p "Continue anyway? (y/n): " -n 1 -r
        echo ""
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            continue
        fi
    fi

    break
done

print_header "Step 3: Saving Configuration"

# Backup existing .env.local if it exists
if [ -f ".env.local" ]; then
    BACKUP_FILE=".env.local.backup.$(date +%Y%m%d_%H%M%S)"
    cp ".env.local" "$BACKUP_FILE"
    print_success "Backed up existing .env.local to $BACKUP_FILE"
fi

# Write the new .env.local
echo "GEMINI_API_KEY=$API_KEY" > .env.local
print_success "Created .env.local with your API key"

# Verify the file was created
if [ ! -f ".env.local" ]; then
    print_error "Failed to create .env.local"
    exit 1
fi

# Mask the key for display
MASKED_KEY="${API_KEY:0:10}...${API_KEY: -4}"
print_info "Saved key: $MASKED_KEY"

print_header "Step 4: Verification"

# Check if Node.js is available
if ! command -v node &> /dev/null; then
    print_warning "Node.js not found - skipping verification"
    print_info "Install Node.js to use the verification script"
else
    echo "Would you like to verify the API key now?"
    read -p "(This will make a test request to Gemini API) (y/n): " -n 1 -r
    echo ""

    if [[ $REPLY =~ ^[Yy]$ ]]; then
        if [ -f "verify-api-key.js" ]; then
            echo ""
            node verify-api-key.js
        else
            print_warning "verify-api-key.js not found - skipping verification"
        fi
    fi
fi

print_header "Setup Complete!"

echo "Your Gemini API key has been configured."
echo ""
print_success "Next steps:"
echo ""
echo "  1. Start the development server:"
echo "     ${GREEN}npm run dev${NC}"
echo ""
echo "  2. Open your browser to the URL shown (usually http://localhost:5174)"
echo ""
echo "  3. Test each feature:"
echo "     - Chat Panel"
echo "     - Image Analysis"
echo "     - Transcription"
echo "     - Live Conversation"
echo ""
echo "  4. Check the TESTING_GUIDE.md for detailed testing instructions"
echo ""
print_info "Important: Keep your API key secure!"
echo "  - Never commit .env.local to version control"
echo "  - .env.local is already in .gitignore"
echo "  - Monitor your API usage at: https://aistudio.google.com"
echo ""

# Optional: Ask if they want to start the dev server
if command -v npm &> /dev/null; then
    read -p "Would you like to start the development server now? (y/n): " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        print_success "Starting development server..."
        echo ""
        npm run dev
    fi
fi

exit 0
