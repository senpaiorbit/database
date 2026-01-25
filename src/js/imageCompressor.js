class ImageCompressor {
  constructor() {
    this.currentImageData = null;
    this.compressed = null;
    this.originalSize = 0;
    this.bind();
  }

  bind() {
    document.getElementById('imageInput').addEventListener('change', e => this.loadFile(e));
    document.getElementById('compressBtn').addEventListener('click', () => this.compress());
    document.getElementById('downloadBtn').addEventListener('click', () => this.download());
    document.getElementById('uploadBtn').addEventListener('click', () => this.upload());
    document.getElementById('saveLibraryBtn').addEventListener('click', () => this.saveLibrary());
  }

  loadFile(e) {
    const f = e.target.files[0];
    if (!f) return;
    this.originalSize = f.size;
    const r = new FileReader();
    r.onload = () => {
      this.currentImageData = r.result;
      document.getElementById('previewImage').src = this.currentImageData;
      document.getElementById('originalStats').textContent = `Original: ${this.formatSize(this.originalSize)}`;
      document.getElementById('previewContainer').classList.remove('d-none');
      document.getElementById('compressBtn').disabled = false;
    };
    r.readAsDataURL(f);
  }

  showLoading(show) {
    document.getElementById('loadingState').classList.toggle('d-none', !show);
  }

  async compress() {
    if (!this.currentImageData) return alert('Select an image');
    const format = document.getElementById('outputFormat').value;
    const quality = document.getElementById('qualityLevel').value;
    const width = document.getElementById('resizeWidth').value;
    const height = document.getElementById('resizeHeight').value;
    this.showLoading(true);
    try {
      const res = await imageAPI.compress(this.currentImageData, format, quality, width, height);
      if (res.success) {
        this.compressed = res.data;
        document.getElementById('compressedImage').src = this.compressed.imageData;
        document.getElementById('originalSize').textContent = this.formatSize(this.compressed.originalSize);
        document.getElementById('compressedSize').textContent = this.formatSize(this.compressed.compressedSize);
        document.getElementById('compressionRate').textContent = this.compressed.compressionRate;
        document.getElementById('resultContainer').classList.remove('d-none');
        document.getElementById('noResult').classList.add('d-none');
      }
    } catch (err) {
      alert('Compression failed: ' + err.message);
    } finally {
      this.showLoading(false);
    }
  }

  download() {
    if (!this.compressed) return;
    const a = document.createElement('a');
    a.href = this.compressed.imageData;
    a.download = `compressed.${this.compressed.format}`;
    a.click();
  }

  async upload() {
    if (!this.compressed) return;
    const btn = document.getElementById('uploadBtn');
    btn.disabled = true;
    btn.textContent = 'Uploading...';
    try {
      const res = await imageAPI.upload(this.compressed.imageData);
      if (res.success) {
        alert('Uploaded: ' + res.data.url);
        // Save minimal uploaded info to library
        const item = {
          id: res.data.imageId || Date.now(),
          url: res.data.url,
          thumbUrl: res.data.thumbUrl,
          size: res.data.size,
          uploadDate: res.data.uploadDate,
          raw: res.data.raw
        };
        imageLibrary.addImage(item);
      }
    } catch (err) {
      alert('Upload failed: ' + err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Upload to freeimage.host';
    }
  }

  saveLibrary() {
    if (!this.compressed) return;
    const item = {
      id: Date.now(),
      data: this.compressed.imageData,
      format: this.compressed.format,
      originalSize: this.compressed.originalSize,
      compressedSize: this.compressed.compressedSize,
      timestamp: new Date().toISOString()
    };
    imageLibrary.addImage(item);
    alert('Saved to library');
  }

  formatSize(bytes) {
    if (!bytes) return '0 B';
    const units = ['B','KB','MB','GB'];
    let i=0; while (bytes>=1024 && i<units.length-1) { bytes/=1024; i++; }
    return Math.round(bytes*100)/100 + ' ' + units[i];
  }
}

window.imageCompressor = new ImageCompressor();