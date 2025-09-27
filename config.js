module.exports = {
    port: process.env.PORT || 5252,
    // Add any other configuration variables here
    allowedOrigins: [
        'https://localhost:5252',
        'https://localhost:5252',
        'https://localhost:9000',
        'http://localhost:9000',
        'https://btcforplebs.com',
        'http://btcforplebs.com',
        'https://services.btcforplebs.com',
        'http://services.btcforplebs.com'
    ]
};