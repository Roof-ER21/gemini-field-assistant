#!/bin/bash

# Inspection Presentation Test Runner
# Quick script to run inspection presentation tests with various options

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Banner
echo -e "${BLUE}"
echo "================================================"
echo "  Inspection Presentation Test Suite"
echo "================================================"
echo -e "${NC}"

# Function to print section headers
print_header() {
    echo -e "${GREEN}▶ $1${NC}"
}

# Function to print info
print_info() {
    echo -e "${YELLOW}ℹ $1${NC}"
}

# Function to print errors
print_error() {
    echo -e "${RED}✗ $1${NC}"
}

# Check if npm is available
if ! command -v npm &> /dev/null; then
    print_error "npm not found. Please install Node.js and npm."
    exit 1
fi

# Parse command line arguments
MODE="${1:-all}"

case "$MODE" in
    all)
        print_header "Running All Inspection Presentation Tests"
        npm test -- inspectionPresentationRoutes.test.ts
        ;;

    coverage)
        print_header "Running Tests with Coverage Report"
        npm test -- inspectionPresentationRoutes.test.ts --coverage
        print_info "Coverage report generated in ./coverage/"
        ;;

    watch)
        print_header "Running Tests in Watch Mode"
        print_info "Tests will re-run automatically on file changes"
        npm test -- inspectionPresentationRoutes.test.ts --watch
        ;;

    inspections)
        print_header "Running Inspection CRUD Tests Only"
        npm test -- inspectionPresentationRoutes.test.ts -t "Inspection Routes"
        ;;

    photos)
        print_header "Running Photo Upload Tests Only"
        npm test -- inspectionPresentationRoutes.test.ts -t "Photo Routes"
        ;;

    ai)
        print_header "Running AI Analysis Tests Only"
        npm test -- inspectionPresentationRoutes.test.ts -t "AI Analysis"
        ;;

    presentations)
        print_header "Running Presentation Generation Tests Only"
        npm test -- inspectionPresentationRoutes.test.ts -t "Presentation Routes"
        ;;

    sharing)
        print_header "Running Sharing Tests Only"
        npm test -- inspectionPresentationRoutes.test.ts -t "Sharing Routes"
        ;;

    edge)
        print_header "Running Edge Cases Tests Only"
        npm test -- inspectionPresentationRoutes.test.ts -t "Edge Cases"
        ;;

    ci)
        print_header "Running Tests in CI Mode (coverage + reporters)"
        npm test -- inspectionPresentationRoutes.test.ts --coverage --reporter=verbose --reporter=json --outputFile=test-results.json
        print_info "Results saved to test-results.json"
        ;;

    help|--help|-h)
        echo "Usage: ./run-inspection-tests.sh [MODE]"
        echo ""
        echo "Modes:"
        echo "  all            Run all tests (default)"
        echo "  coverage       Run with coverage report"
        echo "  watch          Run in watch mode"
        echo "  inspections    Run inspection CRUD tests only"
        echo "  photos         Run photo upload tests only"
        echo "  ai             Run AI analysis tests only"
        echo "  presentations  Run presentation generation tests only"
        echo "  sharing        Run sharing tests only"
        echo "  edge           Run edge cases tests only"
        echo "  ci             Run in CI mode with coverage and reports"
        echo "  help           Show this help message"
        echo ""
        echo "Examples:"
        echo "  ./run-inspection-tests.sh"
        echo "  ./run-inspection-tests.sh coverage"
        echo "  ./run-inspection-tests.sh watch"
        echo "  ./run-inspection-tests.sh ai"
        ;;

    *)
        print_error "Unknown mode: $MODE"
        echo "Run './run-inspection-tests.sh help' for usage information"
        exit 1
        ;;
esac

# Exit with test result code
EXIT_CODE=$?

echo ""
if [ $EXIT_CODE -eq 0 ]; then
    echo -e "${GREEN}✓ Tests completed successfully${NC}"
else
    echo -e "${RED}✗ Tests failed${NC}"
fi

exit $EXIT_CODE
