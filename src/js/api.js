class ImageAPI {
  constructor() {
    this.base = '/.netlify/functions';
  }

  async compress(imageData, format, quality, width, height) {
    const res = await fetch(`${this.base}/compress`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageData, format, quality, width, height })
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Compress failed');
    return res.json();
  }

  async upload(imageData) {
    const res = await fetch(`${this.base}/uploadImage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageData })
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Upload failed');
    return res.json();
  }

  async getLibraryInfo() {
    const res = await fetch(`${this.base}/getLibrary`);
    return res.json();
  }
}

const imageAPI = new ImageAPI();