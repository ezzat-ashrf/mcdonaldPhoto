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

const avatarPrompt = `Perform one strict background-replacement edit on Image 1 and return an exact 9:16 portrait image.
Image 1 is the only authoritative source. Image 2 is merely a duplicate detail reference of the same capture and must not create another person. This is NOT portrait generation, face generation, face enhancement, avatar creation, restyling, or pose correction.
ABSOLUTE SUBJECT GEOMETRY LOCK — HIGHEST PRIORITY: copy every real person from Image 1 exactly as photographed. Preserve the complete subject pixels wherever possible, including the exact face direction, head rotation, profile or three-quarter angle, gaze direction, eye position, expression, mouth, teeth, facial geometry, skin texture, natural asymmetry, hair, hairline, facial hair, ears, glasses, head covering, neck, shoulders, body, pose, hands, clothing, fabric, accessories, scale, location, and visible crop. If the person looks sideways, keep them looking sideways at precisely the same angle. If only one eye is visible, keep only that eye visible. Never turn the head toward the camera, create a frontal view, redirect the eyes, center the face, straighten the pose, change expression, reconstruct hidden facial regions, mirror the person, or invent details. Never regenerate, redraw, retouch, beautify, sharpen, smooth, reshape, de-age, stylize, illustrate, or replace any part of a person. Do not change even small facial details. Do not alter the number, order, position, or size of people.
ONLY ALLOWED EDIT: identify pixels belonging to the original environment behind the people and replace only those background pixels with one completely plain, solid bright golden yellow matching the yellow associated with the Golden Arches. The yellow must be edge-to-edge with no pattern, gradient, vignette, logo, text, objects, scenery, shadow graphics, or other colors.
LIGHTING INTEGRATION — PHOTOMETRIC CHANGES ONLY: without changing any geometry, facial feature, direction, expression, texture, pose, or clothing detail, balance exposure and white balance so the captured person belongs naturally in the yellow studio. Use a large soft frontal key and broad gentle fill to avoid dark facial shadows while preserving the original light direction and facial appearance. Apply only subtle golden-yellow environmental bounce to the outermost hair, shoulder, and clothing edges, never across facial features or skin. Add a faint soft contact shadow behind the subject on the yellow background. Lighting adjustments must be smooth and global, not painted facial edits.
EDGE QUALITY: preserve original fine hair strands, flyaway hair, semi-transparent edges, clothing edges, and accessories accurately. Remove old background color spill only at the cutout boundary without changing interior subject details. Use natural antialiasing with no hard cutout line, dark fringe, bright halo, glow outline, mismatched blur, missing hair, or erased body parts. Match sharpness, noise, contrast, and depth of field across the subject boundary so it never looks pasted or cut out.
OUTPUT: return only the edited photograph. The person must remain identical in identity, face direction, expression, geometry, pose, and detail; changes are limited to solid-yellow background replacement and subtle physically believable lighting integration. No borders, frames, captions, before-and-after layout, QR code, or watermark.`;

const caricaturePrompt = `Create one polished vertical 9:16 caricature portrait of every real person in Image 1.
Image 1 is the authoritative camera photo. Image 2 is a duplicate facial-detail reference of the same people. Use these photos for identity, not for realistic facial proportions.
IDENTITY: keep every person immediately recognizable. Preserve age, skin tone, hairstyle, hair color, facial hair, glasses, hijab and other head coverings, clothing, accessories, expression, pose, hands, number of people, left-to-right order, and relative heights. Keep adults clearly adult and preserve all covered hair and skin.
CARICATURE IS THE PRIMARY REQUIREMENT: create a bold professional hand-drawn editorial caricature, like a skilled live-event caricature artist. Enlarge the head to approximately 1.5 to 2 times its natural size relative to the shoulders and body. Study each person's actual facial structure and strongly exaggerate their two or three most distinctive individual features: for example nose shape, jaw width, chin length, cheekbones, forehead, eyebrow arch, smile, or ears. Push the existing shapes and asymmetry while keeping the person instantly recognizable. Preserve likeness through those distinctive features, not by keeping exact realistic facial geometry. Do not enlarge everyone's eyes or give everyone the same face. Use confident ink linework, expressive contours, cross-hatching and hand-painted watercolor or gouache shading with visible brush texture on the person. The result must have obvious humorous anatomical exaggeration even at thumbnail size. Avoid generic cartoon avatars, anime, Disney/Pixar animation styling, 3D renders, smooth cel-shaded avatar filters, dolls, and realistic-proportion illustrated portraits. Keep the humor friendly and respectful. Do not invent missing limbs or extra people.
COMPOSITION: retain the source pose and visible body regions, but allow reframing and extra headroom to accommodate the enlarged caricature head without clipping hair or head coverings.
${avatarPrompt.slice(avatarPrompt.indexOf('BACKGROUND:'), avatarPrompt.indexOf('OUTPUT:'))}
OUTPUT: return only the finished caricature artwork, edge-to-edge in exact 9:16 portrait orientation, without borders, split panels, before-and-after layouts, or reference characters.`;

const avatarStyles = {
  classic2d: 'FINAL MODE: background replacement with photometric integration only. Preserve the photographed person exactly; allow only exposure, white-balance, edge-bounce, and contact-shadow adjustments that do not change identity, face direction, expression, geometry, pose, or subject detail.',
  premium3d: 'FINAL RENDER STYLE: premium cinematic 3D animated-character portrait with sophisticated feature-film quality, softly sculpted but identity-accurate facial forms, realistic skin shading without visible pores, carefully groomed hair strands, physically believable fabric, and polished high-end rendering. LIGHTING IS CRITICAL: expose the person for the face, never for the bright yellow background. Use one large soft frontal key light positioned slightly above eye level, a broad gentle fill light at approximately 60 to 70 percent of the key, and soft global illumination. Illuminate both eyes, both cheeks, the nose, mouth, beard, neck, and front of the clothing clearly and evenly. Add natural soft catchlights in both eyes. Lift shadows under the eyebrows, eyes, nose, beard, chin, and collar while retaining subtle dimensional modeling. Keep skin tone natural, warm-neutral, and correctly exposed. Use only a faint narrow rim light for separation; never create a bright halo or allow backlight to dominate. The face must be brighter than the clothing and must not appear underexposed, shadowy, muddy, silhouetted, overly contrasty, or lit primarily from behind. Avoid clipped highlights and flat flash lighting. Preserve the exact adult facial proportions and expression. Avoid toy-like plastic, wax skin, childish styling, giant eyes, oversized head, exaggerated smile, mascot appearance, or generic family-animation character features.'
};

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
      const requestedStyle = ['classic2d', 'premium3d', 'caricature'].includes(req.body?.avatarStyle)
        ? req.body.avatarStyle : 'classic2d';
      // Never send the animated reference for the photorealistic Classic mode.
      const styleData = requestedStyle === 'premium3d'
        ? fs.readFileSync(path.join(__dirname, 'assets', 'AvatarStyleReference.jpeg')).toString('base64')
        : null;
      const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
      const token = await auth.getAccessToken();
      const endpoint = `https://aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${model}:generateContent`;
      const body = {
        contents: [{ role: 'user', parts: [
          { text: requestedStyle === 'caricature' ? caricaturePrompt : `${avatarPrompt}\n${avatarStyles[requestedStyle]}` },
          { inline_data: { mime_type: input.mimeType, data: input.data } },
          { inline_data: { mime_type: input.mimeType, data: input.data } },
          ...(styleData ? [{ inline_data: { mime_type: 'image/jpeg', data: styleData } }] : []),
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
