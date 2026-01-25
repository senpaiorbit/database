// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    console.log('Image Compressor App Initialized');
    console.log('Features:');
    console.log('- Upload and compress images');
    console.log('- Convert between formats (PNG, JPEG, WebP, AVIF, TIFF)');
    console.log('- Resize images');
    console.log('- Upload to free cloud storage (freeimage.host)');
    console.log('- Local image library with localStorage');
});

// Handle unhandled errors
window.addEventListener('error', (event) => {
    console.error('Unhandled error:', event.error);
});

window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason);
});