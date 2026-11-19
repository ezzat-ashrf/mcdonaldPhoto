'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { GoogleAuth } = require('google-auth-library');
const { initializeApp } = require('firebase-admin/app');
const { getAppCheck } = require('firebase-admin/app-check');

const projectId = 'gen-lang-client-0899943261';
const location = 'global';
const model = 'gemini-3-pro-image';
const allowedOrigins = new Set([
  'https://ezzat-ashrf.github.io',
  'http://localhost:8080',
  'http://127.0.0.1:8080',
]);
initializeApp({ projectId });
const recentRequests = new Map();

const avatarPrompt = `Create one polished vertical 9:16 AI avatar portrait of every real person in Image 1.
Image 1 is the authoritative camera photo. Image 2 is only a duplicate facial-detail reference of the same photo and is not another person. Image 3 is a style reference only: use its clean, friendly, premium animated-avatar rendering style, but never copy its girl, face, hair, clothing, pose, body, text, booth, screen, or background.
IDENTITY IS CRITICAL: preserve each visitor's exact recognizable identity, face shape, eyes, eyebrows, nose, lips, smile or neutral expression, skin tone, age, gender presentation, hairstyle, hair color, facial hair, glasses, hijab or other religious head covering, distinctive features, body type, pose, hand position, clothing colors, accessories, and the original number of people. Never beautify, de-age, slim, widen, masculinize, feminize, remove a hijab, expose covered hair or skin, or replace the visitor with the reference character.
AVATAR TREATMENT: transform the photographed visitor into a high-quality contemporary animated character with elegant 2.5D digital illustration, smooth but dimensional cel shading, refined clean outlines, expressive natural eyes that retain the visitor's real eye shape and color, softly modeled facial planes, detailed hair strands, realistic fabric folds, and tasteful studio-quality highlights. Keep adult visitors clearly adult. Avoid childish proportions, giant eyes, an oversized head, plastic 3D skin, doll-like features, or a generic anime face.
COMPOSITION: preserve the source pose and visible crop. Center the avatar naturally with comfortable headroom. If one person is present, show that person once. If two people are present, show both once in the same left-to-right order and with their natural relative heights. Do not invent missing limbs or body regions.
BACKGROUND: use one completely plain, solid bright golden-yellow background matching the yellow color associated with the Golden Arches. The background must be edge-to-edge yellow with no pattern, no red accents, no lines, no shapes, no symbols, no texture, no objects, no scenery, no visible vignette, and no multicolor gradient. A barely perceptible yellow-on-yellow studio lighting falloff is allowed only if it remains visually solid yellow. Maintain clean separation between the yellow background and the person's natural skin, hair, and clothing without recoloring the person. ABSOLUTELY NO red, orange, amber, white, cream, brown, black, blue, cyan, green, violet, magenta, gray, or any other background color. Do not create an M or Golden Arches shape. Do not add any logo, brand name, food, packaging, captions, UI, buttons, QR code, watermark, poster frame, booth hardware, or readable text; the application adds its own branded interface.
OUTPUT: return only the finished avatar artwork, edge-to-edge in exact 9:16 portrait orientation, with no borders, split panels, before-and-after layout, or reference character. The result must feel friendly, confident, modern, premium, and immediately recognizable as the photographed visitor.`;

function setCors(req, res) {
  const origin = req.headers.origin;
  if (allowedOrigins.has(origin)) res.set('Access-Control-Allow-Origin', origin);
  res.set('Vary', 'Origin');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, X-Firebase-AppCheck');
}

async function verifyAppCheckAndRateLimit(req, action = 'avatar', cooldownMs = 30_000) {
  const token = req.get('X-Firebase-AppCheck');
  if (!token) throw Object.assign(new Error('Missing App Check token'), { statusCode: 401 });
  let claims;
  try { claims = await getAppCheck().verifyToken(token); }
  catch (_) { throw Object.assign(new Error('Invalid App Check token'), { statusCode: 401 }); }
  const key = `${action}:${claims.appId || claims.sub || 'app'}:${req.ip || 'unknown'}`;
  const now = Date.now();
  const last = recentRequests.get(key) || 0;
  if (now - last < cooldownMs) {
    throw Object.assign(new Error(`Please wait ${Math.ceil(cooldownMs / 1000)} seconds before trying again`), { statusCode: 429 });
  }
  recentRequests.set(key, now);
  if (recentRequests.size > 5000) {
    for (const [entry, time] of recentRequests) if (now - time > 3_600_000) recentRequests.delete(entry);
  }
}

function parseDataUrl(value) {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(value || '');
  if (!match) throw new Error('imageBase64 must be a JPEG, PNG, or WebP data URL');
  if (match[2].length > 14_000_000) throw new Error('Image is too large');
  return { mimeType: match[1], data: match[2] };
}

exports.generateAvatar = async (req, res) => {
    setCors(req, res);
    if (req.method === 'OPTIONS') return res.status(204).send('');
    if (!allowedOrigins.has(req.headers.origin)) return res.status(403).json({ error: 'Origin not allowed' });
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST required' });

    try {
      await verifyAppCheckAndRateLimit(req, 'avatar', 30_000);
      const input = parseDataUrl(req.body?.imageBase64);
      const stylePath = path.join(__dirname, 'assets', 'AvatarStyleReference.jpeg');
      const styleData = fs.readFileSync(stylePath).toString('base64');
      const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
      const token = await auth.getAccessToken();
      const endpoint = `https://aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${model}:generateContent`;
      const body = {
        contents: [{ role: 'user', parts: [
          { text: avatarPrompt },
          { inline_data: { mime_type: input.mimeType, data: input.data } },
          { inline_data: { mime_type: input.mimeType, data: input.data } },
          { inline_data: { mime_type: 'image/jpeg', data: styleData } },
        ] }],
        generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '9:16' } },
      };

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok) {
        console.error('Vertex error', response.status, JSON.stringify(result));
        return res.status(response.status).json({ error: result?.error?.message || 'Avatar generation failed' });
      }
      const parts = result?.candidates?.flatMap((candidate) => candidate?.content?.parts || []) || [];
      const image = parts.find((part) => part.inlineData?.data || part.inline_data?.data);
      const data = image?.inlineData?.data || image?.inline_data?.data;
      const mimeType = image?.inlineData?.mimeType || image?.inline_data?.mime_type || 'image/png';
      if (!data) return res.status(502).json({ error: 'Vertex returned no image' });
      return res.status(200).json({ imageBase64: `data:${mimeType};base64,${data}` });
    } catch (error) {
      console.error(error);
      return res.status(error.statusCode || 500).json({ error: error.message || 'Internal error' });
    }
};

exports.generateQr = async (req, res) => {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).send('');
  if (!allowedOrigins.has(req.headers.origin)) return res.status(403).json({ error: 'Origin not allowed' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST required' });

  try {
    await verifyAppCheckAndRateLimit(req, 'qr', 3_000);
    const input = parseDataUrl(req.body?.imageBase64);
    const endpoint = 'https://optima-software-solutions.com/sts/stsimageqr/api.php';
    let lastError;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        const form = new FormData();
        form.append('image', new Blob([Buffer.from(input.data, 'base64')], { type: input.mimeType }), 'mcdonalds_avatar.jpg');
        const response = await fetch(endpoint, { method: 'POST', body: form, signal: AbortSignal.timeout(30_000) });
        const raw = await response.text();
        if (!response.ok) throw new Error(`QR service returned ${response.status}`);
        let result;
        try { result = JSON.parse(raw); }
        catch (_) { throw new Error('QR service returned an invalid response'); }
        const qrValue = result.qr_code_url || result.qr_url || result.data?.qr_code_url || result.data?.qr_url;
        const success = typeof result.success === 'boolean' ? result.success : Boolean(qrValue);
        if (!success || !qrValue) throw new Error(result.message || 'QR service returned no QR image');
        return res.status(200).json({ qrCodeUrl: new URL(qrValue, endpoint).toString() });
      } catch (error) {
        lastError = error;
        if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 1200 * attempt));
      }
    }
    throw lastError || new Error('QR generation failed');
  } catch (error) {
    console.error(error);
    return res.status(error.statusCode || 502).json({ error: error.message || 'QR generation failed' });
  }
};
