// Folder Toggle Function
document.addEventListener('DOMContentLoaded', () => {
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

  fetch('https://api.github.com/repos/btcforplebs/BTCforPlebs.com/commits/main')
    .then(response => response.json())
    .then(data => {
      const lastUpdate = new Date(data.commit.author.date); // Commit date
      const formattedDate = lastUpdate.toLocaleDateString();
      const formattedTime = lastUpdate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      // Update the text content of the last-updated-text element
      document.getElementById('last-updated-text').textContent = `Website last updated: ${formattedDate} ${formattedTime}`;
    })
    .catch(error => {
      console.error('Error fetching last update:', error);
      document.getElementById('last-updated-text').textContent = 'Last update: Error fetching data.';
    });


});

