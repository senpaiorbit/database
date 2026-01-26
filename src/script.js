// Configuration
const API_KEY = '6d207e02198a847aa98d0a2a901485a5';
const API_URL = 'https://freeimage.host/api/1/upload';

// State
let currentFile = null;
let compressedBlob = null;
let selectedFormat = 'jpeg';
let originalSize = 0;

// DOM Elements
const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');
const formatSelector = document.getElementById('formatSelector');
const qualitySlider = document.getElementById('qualitySlider');
const quality = document.getElementById('quality');
const qualityValue = document.getElementById('qualityValue');
const previewContainer = document.getElementById('previewContainer');
const originalImage = document.getElementById('originalImage');
const compressedImage = document.getElementById('compressedImage');
const originalInfo = document.getElementById('originalInfo');
const compressedInfo = document.getElementById('compressedInfo');
const uploadBtn = document.getElementById('uploadBtn');
const progressContainer = document.getElementById('progressContainer');
const progressBar = document.getElementById('progressBar');
const progressText = document.getElementById('progressText');
const imageLibrary = document.getElementById('imageLibrary');
const clearLibrary = document.getElementById('clearLibrary');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadLibrary();
    updateStats();
});

// Drag and Drop
uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('dragover');
});

uploadArea.addEventListener('dragleave', () => {
    uploadArea.classList.remove('dragover');
});

uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('dragover');
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        handleFile(files[0]);
    }
});

uploadArea.addEventListener('click', () => {
    fileInput.click();
});

fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        handleFile(e.target.files[0]);
    }
});

// Handle File Upload
function handleFile(file) {
    if (!file.type.startsWith('image/')) {
        alert('Please upload an image file');
        return;
    }

    currentFile = file;
    originalSize = file.size;

    // Show format selector and quality slider
    formatSelector.style.display = 'flex';
    qualitySlider.style.display = 'block';

    // Display original image
    const reader = new FileReader();
    reader.onload = (e) => {
        originalImage.src = e.target.result;
        displayImageInfo(file, originalInfo);
        previewContainer.style.display = 'flex';
        
        // Auto compress with default settings
        compressImage();
    };
    reader.readAsDataURL(file);
}

// Format Selection
document.querySelectorAll('.format-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.format-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        selectedFormat = e.target.dataset.format;
        if (currentFile) compressImage();
    });
});

// Quality Slider
quality.addEventListener('input', (e) => {
    qualityValue.textContent = e.target.value;
    if (currentFile) compressImage();
});

// Compress Image
function compressImage() {
    const reader = new FileReader();
    reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);

            // Convert to selected format with quality
            const mimeType = `image/${selectedFormat}`;
            const qualityVal = quality.value / 100;

            canvas.toBlob((blob) => {
                compressedBlob = blob;
                
                // Display compressed image
                const url = URL.createObjectURL(blob);
                compressedImage.src = url;
                
                // Display compressed info
                displayCompressedInfo(blob);
            }, mimeType, qualityVal);
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(currentFile);
}

// Display Image Info
function displayImageInfo(file, element) {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = (e) => {
        img.onload = () => {
            element.innerHTML = `
                <strong>Size:</strong> ${formatFileSize(file.size)}<br>
                <strong>Dimensions:</strong> ${img.width} × ${img.height}px<br>
                <strong>Type:</strong> ${file.type}
            `;
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

// Display Compressed Info
function displayCompressedInfo(blob) {
    const reduction = ((originalSize - blob.size) / originalSize * 100).toFixed(1);
    compressedInfo.innerHTML = `
        <strong>Size:</strong> ${formatFileSize(blob.size)}<br>
        <strong>Format:</strong> image/${selectedFormat}<br>
        <strong>Reduced by:</strong> <span class="text-success">${reduction}%</span>
    `;
}

// Upload to FreeImage.host
uploadBtn.addEventListener('click', async () => {
    if (!compressedBlob) {
        alert('Please select an image first');
        return;
    }

    progressContainer.style.display = 'block';
    uploadBtn.disabled = true;
    progressBar.style.width = '30%';
    progressText.textContent = 'Preparing image...';

    try {
        // Convert blob to base64
        const base64 = await blobToBase64(compressedBlob);
        
        progressBar.style.width = '60%';
        progressText.textContent = 'Uploading to FreeImage.host...';

        // Upload to API
        const formData = new FormData();
        formData.append('key', API_KEY);
        formData.append('action', 'upload');
        formData.append('source', base64);
        formData.append('format', 'json');

        const response = await fetch(API_URL, {
            method: 'POST',
            body: formData
        });

        progressBar.style.width = '90%';

        const data = await response.json();

        if (data.status_code === 200) {
            progressBar.style.width = '100%';
            progressText.textContent = 'Upload successful!';
            
            // Save to library
            saveToLibrary(data.image);
            
            // Reset after success
            setTimeout(() => {
                resetForm();
            }, 1500);
        } else {
            throw new Error(data.error?.message || 'Upload failed');
        }
    } catch (error) {
        console.error('Upload error:', error);
        progressText.textContent = 'Upload failed: ' + error.message;
        progressBar.classList.add('bg-danger');
    } finally {
        uploadBtn.disabled = false;
    }
});

// Convert Blob to Base64
function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const base64 = reader.result.split(',')[1];
            resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

// Save to Library
function saveToLibrary(imageData) {
    let library = JSON.parse(localStorage.getItem('imageLibrary') || '[]');
    
    const libraryItem = {
        id: Date.now(),
        name: imageData.name,
        url: imageData.url,
        display_url: imageData.display_url,
        thumb_url: imageData.thumb?.url || imageData.display_url,
        viewer_url: imageData.url_viewer,
        size: imageData.size,
        size_formatted: imageData.size_formatted,
        width: imageData.width,
        height: imageData.height,
        extension: imageData.extension,
        date: new Date().toISOString(),
        originalSize: originalSize
    };
    
    library.unshift(libraryItem);
    localStorage.setItem('imageLibrary', JSON.stringify(library));
    
    loadLibrary();
    updateStats();
}

// Load Library
function loadLibrary() {
    const library = JSON.parse(localStorage.getItem('imageLibrary') || '[]');
    
    if (library.length === 0) {
        imageLibrary.innerHTML = `
            <div class="col-12 text-center text-muted py-5">
                <i class="bi bi-inbox display-1"></i>
                <p class="mt-3">No images yet. Upload some images to get started!</p>
            </div>
        `;
        return;
    }
    
    imageLibrary.innerHTML = library.map(item => `
        <div class="col-md-4 col-sm-6">
            <div class="library-item">
                <img src="${item.thumb_url}" alt="${item.name}" loading="lazy">
                <div class="library-item-overlay">
                    <small>${item.name}.${item.extension}</small><br>
                    <small>${item.size_formatted} • ${item.width}×${item.height}</small>
                </div>
                <div class="library-item-actions">
                    <button class="btn btn-sm btn-primary btn-icon" onclick="viewImage('${item.viewer_url}')" title="View">
                        <i class="bi bi-eye"></i>
                    </button>
                    <button class="btn btn-sm btn-success btn-icon" onclick="copyUrl('${item.url}')" title="Copy URL">
                        <i class="bi bi-link-45deg"></i>
                    </button>
                    <button class="btn btn-sm btn-danger btn-icon" onclick="deleteImage(${item.id})" title="Delete">
                        <i class="bi bi-trash"></i>
                    </button>
                </div>
            </div>
        </div>
    `).join('');
}

// View Image
function viewImage(url) {
    window.open(url, '_blank');
}

// Copy URL
function copyUrl(url) {
    navigator.clipboard.writeText(url).then(() => {
        const toast = document.createElement('div');
        toast.className = 'position-fixed top-0 start-50 translate-middle-x mt-3 alert alert-success';
        toast.style.zIndex = '9999';
        toast.innerHTML = '<i class="bi bi-check-circle"></i> URL copied to clipboard!';
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 2000);
    });
}

// Delete Image
function deleteImage(id) {
    if (confirm('Are you sure you want to delete this image from your library?')) {
        let library = JSON.parse(localStorage.getItem('imageLibrary') || '[]');
        library = library.filter(item => item.id !== id);
        localStorage.setItem('imageLibrary', JSON.stringify(library));
        loadLibrary();
        updateStats();
    }
}

// Clear Library
clearLibrary.addEventListener('click', () => {
    if (confirm('Are you sure you want to clear all images from your library?')) {
        localStorage.removeItem('imageLibrary');
        loadLibrary();
        updateStats();
    }
});

// Update Statistics
function updateStats() {
    const library = JSON.parse(localStorage.getItem('imageLibrary') || '[]');
    
    document.getElementById('totalImages').textContent = library.length;
    
    const totalSize = library.reduce((sum, item) => sum + item.size, 0);
    document.getElementById('totalSize').textContent = formatFileSize(totalSize);
    
    const totalOriginal = library.reduce((sum, item) => sum + (item.originalSize || item.size), 0);
    const saved = totalOriginal > 0 ? ((totalOriginal - totalSize) / totalOriginal * 100).toFixed(1) : 0;
    document.getElementById('savedSpace').textContent = saved + '%';
}

// Format File Size
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

// Reset Form
function resetForm() {
    currentFile = null;
    compressedBlob = null;
    fileInput.value = '';
    formatSelector.style.display = 'none';
    qualitySlider.style.display = 'none';
    previewContainer.style.display = 'none';
    progressContainer.style.display = 'none';
    progressBar.style.width = '0%';
    progressBar.classList.remove('bg-danger');
    document.querySelectorAll('.format-btn').forEach(b => b.classList.remove('active'));
    selectedFormat = 'jpeg';
    quality.value = 80;
    qualityValue.textContent = '80';
}
