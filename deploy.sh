#!/bin/bash

# Production deployment script for BTCforPlebs status service

# Install dependencies
npm install

# Set production environment
export NODE_ENV=production

# Install PM2 if not already installed
if ! command -v pm2 &> /dev/null; then
    npm install -g pm2
fi

# Start or restart the service with PM2
pm2 restart checklinks.js || pm2 start checklinks.js --name "btcforplebs-status"

# Save PM2 config to run on system startup
pm2 save

# Show running processes
pm2 list