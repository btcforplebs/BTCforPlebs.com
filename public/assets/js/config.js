// Configuration for the frontend
const config = {
    // API base URL - use localhost in development, services subdomain in production
    apiBaseUrl: window.location.hostname === 'localhost' 
        ? 'http://localhost:5252' 
        : 'https://services.btcforplebs.com',
    
    // Debug mode - enable logging in development
    debug: window.location.hostname === 'localhost'
};

// Set up logging
if (config.debug) {
    console.log('Running in development mode');
    console.log('API Base URL:', config.apiBaseUrl);
} else {
    console.log = function() {}; // Disable console.log in production
}