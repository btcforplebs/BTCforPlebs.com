// Store statuses globally
let linkStatuses = {};

// Fetch statuses on page load
document.addEventListener('DOMContentLoaded', () => {
    // Fetch statuses immediately but keep folders closed
    fetch(`${config.apiBaseUrl}/api/link-status`)
        .then(res => res.json())
        .then(statuses => {
            linkStatuses = statuses; // Store for later use
            console.log("Cached link statuses:", linkStatuses);
        })
        .catch(error => console.error("Error:", error));
});

// Helper function to update status emojis
function updateFolderStatuses(folder, statuses) {
    folder.querySelectorAll("a").forEach(link => {
        const url = link.href;
        const matchingUrl = Object.keys(statuses).find(statusUrl => 
            url.includes(new URL(statusUrl).hostname)
        );
        const status = matchingUrl ? statuses[matchingUrl] : "unknown";
        const emoji = status === "online" ? "🟢" : "🔴";
        
        const statusSpan = link.querySelector('.status-emoji');
        if (statusSpan) {
            statusSpan.textContent = emoji;
        }
    });
}

function toggleFolder(folderId, buttonId) {
    const folder = document.getElementById(folderId);
    const button = document.getElementById(buttonId);
    if (!folder || !button) return;

    if (folder.style.display === "none" || folder.style.display === "") {
        folder.style.display = "block";
        button.innerHTML = button.innerHTML.replace("↓", "↑");
        
        // Use cached statuses if available, otherwise fetch new ones
        if (Object.keys(linkStatuses).length > 0) {
            updateFolderStatuses(folder, linkStatuses);
        } else {
            fetch(`${config.apiBaseUrl}/api/link-status`)
                .then(res => res.json())
                .then(statuses => {
                    linkStatuses = statuses;
                    updateFolderStatuses(folder, statuses);
                })
                .catch(error => console.error("Error:", error));
        }
    } else {
        folder.style.display = "none";
        button.innerHTML = button.innerHTML.replace("↑", "↓");
    }
// Wait for both DOM and fetch to complete
async function init() {
    try {
        // Fetch the status first
        console.log("Fetching statuses...");
        const response = await fetch(`${config.apiBaseUrl}/api/link-status`);
        const statuses = await response.json();
        console.log("Got statuses:", statuses);

        // Now update the links
        document.querySelectorAll(".links a").forEach(link => {
            const url = link.href;
            console.log('Checking link:', url); // Debug log
            const matchingUrl = Object.keys(statuses).find(statusUrl => {
                const linkHostname = new URL(url).hostname;
                const statusHostname = new URL(statusUrl).hostname;
                console.log('Comparing:', linkHostname, 'with', statusHostname); // Debug log
                return linkHostname === statusHostname;
            });
            console.log('Matching URL found:', matchingUrl); // Debug log
            const status = matchingUrl ? statuses[matchingUrl] : "unknown";
            console.log('Status for', url, 'is', status); // Debug log
            const emoji = status === "online" ? "🟢" : "🔴";
            
            // Find the span inside this link and update it
            const statusSpan = link.querySelector('.status-emoji');
            if (statusSpan) {
                statusSpan.textContent = emoji;
            }
        });
    } catch (error) {
        console.error("Error:", error);
    }
}
}