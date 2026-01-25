const axios = require('axios');
const FormData = require('form-data');

const FREEIMAGE_API_KEY = process.env.FREEIMAGE_API_KEY || '6d207e02198a847aa98d0a2a901485a5';
const UPLOAD_URL = 'https://freeimage.host/api/1/upload';

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
    const { imageData } = JSON.parse(event.body || '{}');
    if (!imageData) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'No imageData provided' }) };
    }

    const form = new FormData();
    form.append('key', FREEIMAGE_API_KEY);
    form.append('action', 'upload');
    form.append('format', 'json');
    // freeimage.host accepts either a URL or base64 data URI. pass the full data URI.
    form.append('source', imageData);

    const resp = await axios.post(UPLOAD_URL, form, { headers: form.getHeaders(), maxContentLength: Infinity, maxBodyLength: Infinity });

    // freeimage.host returns JSON with .success and .image
    if (resp.data && resp.data.success && resp.data.image) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          data: {
            url: resp.data.image.url,
            thumbUrl: resp.data.image.thumb ? resp.data.image.thumb.url : null,
            viewerUrl: resp.data.image.url_viewer || null,
            imageId: resp.data.image.id_encoded || null,
            size: resp.data.image.size_formatted || null,
            md5: resp.data.image.md5 || null,
            uploadDate: resp.data.image.date || null,
            raw: resp.data.image
          }
        })
      };
    } else {
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Upload failed', details: resp.data }) };
    }
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};