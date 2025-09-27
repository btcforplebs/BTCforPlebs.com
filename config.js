module.exports = {
    port: process.env.PORT || 5252,
    // Add any other configuration variables here
    allowedOrigins: [
        'http://localhost:5252',
        'https://btcforplebs.com',
        'https://www.btcforplebs.com'
    ]
};