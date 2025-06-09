#!/bin/bash

# Setup script for Starlink OTA Server monorepo

set -e

echo "🚀 Setting up Starlink OTA monorepo..."

# Check if pnpm is installed
if ! command -v pnpm &> /dev/null; then
    echo "❌ pnpm is not installed. Please install pnpm first:"
    echo "   npm install -g pnpm"
    echo "   or visit: https://pnpm.io/installation"
    exit 1
fi

echo "✅ pnpm found: $(pnpm --version)"

# Clean existing node_modules and lock files
echo "🧹 Cleaning existing dependencies..."
rm -rf node_modules
rm -rf api/node_modules
rm -rf cli/node_modules
rm -rf dashboard/node_modules

# Install dependencies
echo "📦 Installing dependencies with pnpm..."
pnpm install

# Build all packages
echo "🔨 Building all packages..."
pnpm build

echo "✅ Monorepo setup complete!"
echo ""
echo "Available commands:"
echo "  pnpm dev                    # Start API server in development"
echo "  pnpm dev:admin              # Start Admin server in development"
echo "  pnpm dev:dashboard          # Start Dashboard in development"
echo "  pnpm dev:dashboard:local    # Start Dashboard with local Admin server"
echo "  pnpm build                  # Build all packages"
echo "  pnpm test                   # Run all tests"
echo "  pnpm lint                   # Lint all packages"
echo ""
echo "For more commands, see: pnpm run" 