# BTCforPlebs.com Link Status Server

This server checks the status of various BTCforPlebs services and provides a JSON API endpoint.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the server:
   ```bash
   npm start
   ```

The server will start on port 5252 by default. You can change this by setting the PORT environment variable.

## API Endpoints

- GET `/api/link-status` - Returns the status of all monitored services

## Configuration

Edit `config.js` to modify:
- Port number
- Allowed CORS origins
- Add or remove monitored URLs

## Development

The server uses:
- Express.js for the API server
- node-fetch for making HTTP requests
- CORS enabled for specified origins