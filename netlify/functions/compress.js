const sharp = require('sharp');

const SUPPORTED = ['jpeg', 'png', 'webp', 'avif', 'tiff'];

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    let { imageData, format = 'webp', quality = 'medium', width = null, height = null } = body;

    if (!imageData) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'No imageData provided' }) };
    }

    // Normalize format
    format = format.toLowerCase().replace('jpg', 'jpeg');
    if (!SUPPORTED.includes(format)) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: `Unsupported format. Supported: ${SUPPORTED.join(', ')}` }) };
    }

    // Remove data URI prefix if present
    const match = /^data:.*;base64,/.test(imageData);
    const base64 = match ? imageData.split(',')[1] : imageData;
    const buffer = Buffer.from(base64, 'base64');

    let img = sharp(buffer);

    if (width || height) {
      const w = width ? parseInt(width) : null;
      const h = height ? parseInt(height) : null;
      if ((w && isNaN(w)) || (h && isNaN(h))) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid width/height' }) };
      }
      img = img.resize(w, h, { fit: 'inside', withoutEnlargement: true });
    }

    const qualityMap = { low: 50, medium: 75, high: 90 };
    const q = qualityMap[quality] || 75;

    const optionsMap = {
      jpeg: { quality: q, progressive: true },
      png: { compressionLevel: Math.round((9 * (100 - q)) / 100) || 6 },
      webp: { quality: q },
      avif: { quality: q },
      tiff: { quality: q }
    };

    const outBuffer = await img.toFormat(format, optionsMap[format]).toBuffer();

    const originalSize = buffer.length;
    const compressedSize = outBuffer.length;
    const compressionRate = originalSize ? ((1 - compressedSize / originalSize) * 100).toFixed(2) : '0.00';

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        data: {
          imageData: `data:image/${format};base64,${outBuffer.toString('base64')}`,
          originalSize,
          compressedSize,
          compressionRate: `${compressionRate}%`,
          format
        }
      })
    };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};