function toggleFolder(folderId, buttonId) {
    const folder = document.getElementById(folderId);
    const button = document.getElementById(buttonId);
    if (!folder || !button) return;

    if (folder.style.display === "none" || folder.style.display === "") {
        folder.style.display = "block";
        button.innerHTML = button.innerHTML.replace("↓", "↑");
        
    } else {
        folder.style.display = "none";
        button.innerHTML = button.innerHTML.replace("↑", "↓");
    }
}
