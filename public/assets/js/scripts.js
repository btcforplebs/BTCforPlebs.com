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
      const footer = document.getElementById('footer');
      if (!footer) return;

      footer.innerHTML = data;

      const onChainButton = document.getElementById('onChainButton');
      const lightningButton = document.getElementById('lightningButton');
      const qrCodes = document.getElementById('qrCodes');
      const onChainQRCode = document.getElementById('onChainQRCode');
      const lightningQRCode = document.getElementById('lightningQRCode');

      if (qrCodes) qrCodes.style.display = 'none';

      if (onChainButton && lightningButton && qrCodes && onChainQRCode && lightningQRCode) {
        onChainButton.addEventListener('click', function () {
          const isOnChainVisible = onChainQRCode.style.display === 'block';
          qrCodes.style.display = 'block';
          onChainQRCode.style.display = isOnChainVisible ? 'none' : 'block';
          lightningQRCode.style.display = 'none';
        });

        lightningButton.addEventListener('click', function () {
          const isLightningVisible = lightningQRCode.style.display === 'block';
          qrCodes.style.display = 'block';
          lightningQRCode.style.display = isLightningVisible ? 'none' : 'block';
          onChainQRCode.style.display = 'none';
        });
      }
    })
    .catch(error => console.error('Error loading footer:', error));

  // --- 5. Fetch and Display Last Update from GitHub -----------------------
  fetch('https://api.github.com/repos/btcforplebs/BTCforPlebs.com/commits/main')
    .then(response => response.json())
    .then(data => {
      const lastUpdate = new Date(data.commit.author.date);
      const formattedDate = lastUpdate.toLocaleDateString();
      const formattedTime = lastUpdate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      const updateText = document.getElementById('last-updated-text');
      if (updateText) {
        updateText.textContent = `Website last updated: ${formattedDate} ${formattedTime}`;
      }
    })
    .catch(error => {
      console.error('Error fetching last update:', error);
      const updateText = document.getElementById('last-updated-text');
      if (updateText) {
        updateText.textContent = 'Last update: Error fetching data.';
      }
    });