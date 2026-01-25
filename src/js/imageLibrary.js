class ImageLibrary {
  constructor() {
    this.key = 'imageLibrary';
    this.library = [];
    this.load();
    this.setup();
  }

  setup() {
    document.getElementById('clearLibraryBtn').addEventListener('click', () => {
      if (confirm('Clear library?')) { this.library=[]; this.save(); this.render(); }
    });
  }

  load() {
    try {
      const raw = localStorage.getItem(this.key);
      this.library = raw ? JSON.parse(raw) : [];
    } catch (e) { this.library = []; }
    this.render();
  }

  save() {
    try {
      localStorage.setItem(this.key, JSON.stringify(this.library));
    } catch (e) {
      alert('Unable to save to localStorage. Storage full?');
    }
  }

  addImage(img) {
    this.library.unshift(img);
    // keep limited length to avoid hitting storage
    if (this.library.length > 50) this.library.pop();
    this.save();
    this.render();
  }

  removeImage(id) {
    this.library = this.library.filter(i => i.id !== id);
    this.save();
    this.render();
  }

  download(id) {
    const item = this.library.find(i => i.id === id);
    if (!item) return;
    const a = document.createElement('a');
    if (item.data) { a.href = item.data; a.download = `image-${id}.${item.format || 'png'}`; }
    else if (item.url) { a.href = item.url; a.download = `image-${id}.jpg`; }
    a.click();
  }

  render() {
    const c = document.getElementById('libraryContainer');
    if (!this.library || this.library.length === 0) {
      c.innerHTML = '<div class="col-12 text-center text-muted">No images in library</div>';
      return;
    }
    c.innerHTML = this.library.map(it => `
      <div class="col-sm-6 col-md-4">
        <div class="card">
          <img src="${it.data ? it.data : (it.thumbUrl || it.url)}" class="card-img-top" style="height:160px;object-fit:cover;">
          <div class="card-body p-2">
            <div class="d-flex justify-content-between">
              <button class="btn btn-sm btn-outline-primary" onclick="imageLibrary.download(${it.id})">Download</button>
              <button class="btn btn-sm btn-outline-danger" onclick="imageLibrary.removeImage(${it.id})">Delete</button>
            </div>
            <div class="small text-muted mt-2">${it.size || ''} ${it.timestamp ? new Date(it.timestamp).toLocaleString() : (it.uploadDate ? new Date(it.uploadDate).toLocaleDateString() : '')}</div>
          </div>
        </div>
      </div>
    `).join('');
  }
}

window.imageLibrary = new ImageLibrary();