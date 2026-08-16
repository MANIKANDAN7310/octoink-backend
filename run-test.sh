#!/bin/bash
# Run the custom-design endpoint test against localhost:4999

cd "$(dirname "$0")"

echo ""
echo "=========================================="
echo "Running Custom Design Local Test"
echo "=========================================="
echo ""

node test_custom_design_local.mjs

exit_code=$?

if [ $exit_code -ne 0 ]; then
    echo ""
    echo "Test FAILED with exit code $exit_code"
    exit $exit_code
else
    echo ""
    echo "Test PASSED"
fi
