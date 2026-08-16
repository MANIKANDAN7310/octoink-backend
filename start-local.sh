#!/bin/bash
# Start backend server locally with SMTP_USER env var set to match EMAIL_USER from .env
# This fixes the env var mismatch (code expects SMTP_USER, .env has EMAIL_USER)

cd "$(dirname "$0")"

echo "=========================================="
echo "Starting Octoink Backend Server"
echo "=========================================="
echo ""
echo "Setting SMTP_USER environment variable..."
echo "(This matches the EMAIL_USER from .env)"
echo ""

export SMTP_USER=octoinkstudios7310@gmail.com
node server.js
