module.exports = {
    port: process.env.PORT || 5252,
    // Add any other configuration variables here
    allowedOrigins: [
        'http://localhost',
        'http://localhost:5252',
        'https://localhost',
        'https://localhost:5252',
        'https://btcforplebs.com',
        'https://www.btcforplebs.com',
        'http://btcforplebs.com',
        'http://www.btcforplebs.com',
        'https://services.btcforplebs.com',
        'http://services.btcforplebs.com'
    ]
};