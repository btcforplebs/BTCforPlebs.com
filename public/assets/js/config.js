// Configuration for the frontend
const config = {
    // API base URL - use localhost in development, services subdomain in production
    apiBaseUrl: window.location.hostname === 'localhost' 
        ? 'http://localhost:5252' 
        : 'https://services.btcforplebs.com',
    
    // Debug mode - enable logging in development
    debug: window.location.hostname === 'localhost'
};
