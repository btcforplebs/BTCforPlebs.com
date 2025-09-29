module.exports = {
    port: process.env.PORT || 5252,
    // Add any other configuration variables here
    allowedOrigins: [
        'https://services.btcforplebs.com',
        'http://services.btcforplebs.com',
        'https://btcforplebs.com',
        'http://btcforplebs.com'
    ]
};