#!/bin/bash
# VERB App — One-click Vercel deploy
# Double-click this file in Finder to run it

cd "$(dirname "$0")"

echo "📦 Installing dependencies..."
npm install

echo ""
echo "🚀 Deploying to Vercel..."
echo "   (You'll be prompted to log in on first run)"
echo ""

npx vercel deploy --prod

echo ""
echo "✅ Done! Copy the URL above and paste it into the Slack app webhook."
read -p "Press Enter to close..."
