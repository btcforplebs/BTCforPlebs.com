// Configuration for the frontend
const config = {
    // Use services.btcforplebs.com in production, localhost in development
    apiBaseUrl: window.location.hostname === 'localhost' 
        ? 'http://localhost:5252' 
        : window.location.protocol + '//services.btcforplebs.com'
};