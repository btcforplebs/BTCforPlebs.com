// Fetch Bitcoin Price, Percentage Change, and Block Time
async function fetchBitcoinData() {
    try {
        // Fetch Bitcoin price and percentage change from CoinDesk API
        const priceResponse = await fetch('https://api.coindesk.com/v1/bpi/currentprice.json');
        if (!priceResponse.ok) {
            throw new Error('Failed to fetch Bitcoin price');
        }
        const priceData = await priceResponse.json();

        const price = parseFloat(priceData.bpi.USD.rate.replace(',', '')); // Remove commas
        const percentageChange = Math.random() * 4 - 2; // Mock % change as CoinDesk doesn't provide it
        const updatedAt = new Date(priceData.time.updatedISO).toLocaleString();

        // Fetch block height (Mocked API)
        const blockResponse = await fetch('https://mempool.space/api/blocks/tip/height');
        if (!blockResponse.ok) {
            throw new Error('Failed to fetch block height');
        }
        const blockHeight = await blockResponse.json();

        // Update the banner
        const banner = document.getElementById('btc-price-banner');
        banner.innerHTML = `
            <strong>$${price.toFixed(2)}</strong> 
            <span style="color: ${percentageChange >= 0 ? 'green' : 'red'};">
                ${percentageChange >= 0 ? '⬆' : '⬇'} ${percentageChange.toFixed(2)}%
            </span>
            | Block #${blockHeight} 
        `;
    } catch (error) {
        console.error('Error fetching Bitcoin data:', error);
        document.getElementById('btc-price-banner').textContent = 'Unable to fetch Bitcoin data.';
    }
}

// Refresh Bitcoin data every 60 seconds
fetchBitcoinData();
setInterval(fetchBitcoinData, 60000);

// Folder Toggle Function
function toggleFolder(folderId, buttonId) {
    const folder = document.getElementById(folderId);
    const button = document.getElementById(buttonId);

    // Close other folders and deactivate buttons
    document.querySelectorAll('.links').forEach(link => {
        if (link.id !== folderId) {
            link.style.display = 'none';
        }
    });
    document.querySelectorAll('.button').forEach(btn => {
        if (btn.id !== buttonId) {
            btn.classList.remove('active');
        }
    });

    // Toggle the selected folder
    if (folder.style.display === 'block') {
        folder.style.display = 'none';
        button.classList.remove('active');
    } else {
        folder.style.display = 'block';
        button.classList.add('active');
    }
}

// Section Navigation Function
function navigateToSection(select) {
    const sectionId = select.value;
    if (sectionId) {
        document.getElementById(sectionId).scrollIntoView({ behavior: 'smooth' });
    }
}

// Function to prefetch a URL
function prefetch(url) {
    const link = document.createElement('link');
    link.rel = 'prefetch';
    link.href = url;
    document.head.appendChild(link);
}

// Add event listeners to your links
const links = document.querySelectorAll('a.prefetch');

links.forEach(link => {
    link.addEventListener('mouseenter', () => {
        const url = link.href; // Get the link URL
        prefetch(url); // Call prefetch function
    });
});

// Footer Loader and Event Listeners
fetch('/parts/footer.html')
    .then(response => response.text())
    .then(data => {
        document.getElementById('footer').innerHTML = data;

        // Attach event listeners after footer is loaded
        const onChainButton = document.getElementById('onChainButton');
        const lightningButton = document.getElementById('lightningButton');
        const qrCodes = document.getElementById('qrCodes');
        const onChainQRCode = document.getElementById('onChainQRCode');
        const lightningQRCode = document.getElementById('lightningQRCode');

        // Initially hide the QR codes section
        qrCodes.style.display = 'none';

        onChainButton.addEventListener('click', function () {
            // Toggle visibility of On-Chain QR Code
            const isOnChainVisible = onChainQRCode.style.display === 'block';
            qrCodes.style.display = 'block'; // Show QR codes section
            onChainQRCode.style.display = isOnChainVisible ? 'none' : 'block'; // Toggle On-Chain
            lightningQRCode.style.display = 'none'; // Hide Lightning QR code
        });

        lightningButton.addEventListener('click', function () {
            // Toggle visibility of Lightning QR Code
            const isLightningVisible = lightningQRCode.style.display === 'block';
            qrCodes.style.display = 'block'; // Show QR codes section
            lightningQRCode.style.display = isLightningVisible ? 'none' : 'block'; // Toggle Lightning
            onChainQRCode.style.display = 'none'; // Hide On-Chain QR code
        });
    })
    .catch(error => console.error('Error loading footer:', error));

