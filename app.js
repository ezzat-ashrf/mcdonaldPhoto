'use strict';

const CONFIG = {
  // A secure server endpoint accepting { imageBase64 } and returning
  // { imageBase64 } or { imageUrl }. Leave blank to test with the captured photo.
  avatarEndpoint: window.PHOTO_BOOTH_CONFIG?.avatarEndpoint || '',
  avatarStyle: window.PHOTO_BOOTH_CONFIG?.avatarStyle || 'classic2d',
  qrEndpoint: window.PHOTO_BOOTH_CONFIG?.qrEndpoint || '',
  firebaseUrl: 'https://photo-game-2f638-default-rtdb.firebaseio.com/latest.json',
  uploadRetries: 4,
};

const $ = (id) => document.getElementById(id);
const pages = [...document.querySelectorAll('.page')];
let stream = null;
let finalImage = '';
let remoteImageUrl = '';
let countdownRun = 0;

function syncViewportHeight() {
  const visibleHeight = Math.round(window.visualViewport?.height || window.innerHeight);
  document.documentElement.style.setProperty('--app-height', `${visibleHeight}px`);
}

syncViewportHeight();
window.addEventListener('resize', syncViewportHeight, { passive: true });
window.addEventListener('orientationchange', () => setTimeout(syncViewportHeight, 150), { passive: true });
window.visualViewport?.addEventListener('resize', syncViewportHeight, { passive: true });

function showPage(id) {
  pages.forEach((page) => page.classList.toggle('active', page.id === id));
}

async function playStartVideo() {
  try { await $('startVideo').play(); } catch (_) { /* first tap will retry */ }
}

function stopCamera() {
  if (stream) stream.getTracks().forEach((track) => track.stop());
  stream = null;
  $('camera').srcObject = null;
}

async function openCamera() {
  cancelCountdown();
  showPage('capturePage');
  $('cameraMessage').style.display = 'none';
  stopCamera();
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: 'user' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
    });
    $('camera').srcObject = stream;
    await $('camera').play();
  } catch (error) {
    $('cameraMessage').textContent = 'Camera unavailable. Allow camera permission and use HTTPS or localhost.';
    $('cameraMessage').style.display = 'block';
    console.error(error);
  }
}

function captureJpeg() {
  const video = $('camera');
  if (!video.videoWidth) throw new Error('Camera is not ready');
  const max = 1920;
  const scale = Math.min(1, max / Math.max(video.videoWidth, video.videoHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(video.videoWidth * scale);
  canvas.height = Math.round(video.videoHeight * scale);
  canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', .84);
}

async function generateAvatar(captured) {
  if (!CONFIG.avatarEndpoint) {
    throw new Error('AI backend is not configured yet. Add the deployed function URL to config.js.');
  }
  if (typeof window.getPhotoBoothAppCheckToken !== 'function') {
    throw new Error('App Check could not start. Reload the page.');
  }
  const appCheckToken = await window.getPhotoBoothAppCheckToken();
  const response = await fetch(CONFIG.avatarEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Firebase-AppCheck': appCheckToken },
    body: JSON.stringify({ imageBase64: captured, avatarStyle: $('avatarStyle').value }),
  });
  if (!response.ok) throw new Error(`Avatar generation failed (${response.status})`);
  const result = await response.json();
  if (result.imageBase64) return result.imageBase64.startsWith('data:') ? result.imageBase64 : `data:image/jpeg;base64,${result.imageBase64}`;
  if (result.imageUrl) return result.imageUrl;
  throw new Error('Avatar server returned no image');
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function sendToFirebase(imageBase64) {
  const body = {
    id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    name: 'Guest', message: '', imageBase64, createdAt: Date.now(),
  };
  let lastError;
  for (let attempt = 0; attempt < CONFIG.uploadRetries; attempt += 1) {
    try {
      const response = await fetch(CONFIG.firebaseUrl, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      if (response.ok) {
        const photoUrl = CONFIG.firebaseUrl.replace(/\/latest\.json(?:\?.*)?$/, `/photos/${encodeURIComponent(body.id)}.json`);
        const photoResponse = await fetch(photoUrl, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        });
        if (!photoResponse.ok) throw new Error(`Firebase photo archive rejected upload (${photoResponse.status})`);
        return new URL(`photo.html?id=${encodeURIComponent(body.id)}`, location.href).href;
      }
      if (response.status < 500 && response.status !== 429) throw new Error(`Firebase rejected upload (${response.status})`);
      lastError = new Error(`Firebase temporary error (${response.status})`);
    } catch (error) { lastError = error; }
    await delay(700 * (attempt + 1));
  }
  throw lastError;
}

async function capture() {
  try {
    const captured = captureJpeg();
    stopCamera();
    $('processingImage').src = captured;
    $('processingText').textContent = $('avatarStyle').value === 'caricature' ? 'Creating your caricature…' : 'Creating your avatar…';
    showPage('processingPage');
    finalImage = await generateAvatar(captured);
    $('resultImage').src = finalImage;
    showPage('resultPage');
    try {
      remoteImageUrl = await sendToFirebase(finalImage);
      console.info('Firebase submission:', remoteImageUrl);
    } catch (error) { console.warn('Firebase upload failed:', error); }
  } catch (error) {
    alert(error.message);
    await openCamera();
  }
}

function cancelCountdown() {
  countdownRun += 1;
  const countdown = $('countdown');
  if (countdown) { countdown.hidden = true; countdown.textContent = ''; }
  $('captureButton').disabled = false;
}

async function startCaptureCountdown() {
  const video = $('camera');
  if (!stream || !video.videoWidth || $('captureButton').disabled) return;
  const run = ++countdownRun;
  const countdown = $('countdown');
  $('captureButton').disabled = true;
  countdown.hidden = false;
  for (let number = 3; number >= 1; number -= 1) {
    if (run !== countdownRun) return;
    countdown.textContent = number;
    await delay(1000);
  }
  if (run !== countdownRun) return;
  countdown.hidden = true;
  countdown.textContent = '';
  await capture();
  if (run === countdownRun) $('captureButton').disabled = false;
}

function home() {
  cancelCountdown();
  stopCamera(); finalImage = ''; remoteImageUrl = '';
  showPage('startPage'); playStartVideo();
}

function loadImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not prepare the QR image'));
    image.src = source;
  });
}

async function composeQrFrame() {
  const [photo, frame] = await Promise.all([loadImage(finalImage), loadImage('assets/McDonaldsMoment.png')]);
  const canvas = document.createElement('canvas');
  canvas.width = 941; canvas.height = 1672;
  const context = canvas.getContext('2d');
  context.drawImage(frame, 0, 0, canvas.width, canvas.height);
  const target = { x: 145, y: 352, width: 651, height: 971 };
  const sourceAspect = photo.naturalWidth / photo.naturalHeight;
  const targetAspect = target.width / target.height;
  let sx = 0, sy = 0, sw = photo.naturalWidth, sh = photo.naturalHeight;
  if (sourceAspect > targetAspect) {
    sw = photo.naturalHeight * targetAspect;
    sx = (photo.naturalWidth - sw) / 2;
  } else {
    sh = photo.naturalWidth / targetAspect;
    sy = (photo.naturalHeight - sh) / 2;
  }
  context.drawImage(photo, sx, sy, sw, sh, target.x, target.y, target.width, target.height);
  return canvas.toDataURL('image/jpeg', .88);
}

async function showQr() {
  if (!finalImage) return;
  const button = $('qrButton');
  const qr = $('qrCode');
  button.disabled = true;
  qr.textContent = 'Uploading your framed photo and creating QR…';
  if (!$('qrDialog').open) $('qrDialog').showModal();
  try {
    const framedImage = await composeQrFrame();
    const appCheckToken = await window.getPhotoBoothAppCheckToken();
    const response = await fetch(CONFIG.qrEndpoint || window.PHOTO_BOOTH_CONFIG.qrEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Firebase-AppCheck': appCheckToken },
      body: JSON.stringify({ imageBase64: framedImage }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.qrCodeUrl) throw new Error(result.error || `QR generation failed (${response.status})`);
    const qrImage = document.createElement('img');
    qrImage.src = result.qrCodeUrl;
    qrImage.alt = 'QR code for your framed photo';
    qrImage.width = 260; qrImage.height = 260;
    qr.replaceChildren(qrImage);
    $('downloadPhoto').href = framedImage;
    $('downloadPhoto').download = 'mcdonalds-moment.jpg';
  } catch (error) {
    qr.textContent = `${error.message}. Close and tap GET QR to retry.`;
    console.error(error);
  } finally {
    button.disabled = false;
  }
}

$('avatarStyle').value = ['classic2d', 'premium3d', 'caricature'].includes(CONFIG.avatarStyle) ? CONFIG.avatarStyle : 'classic2d';

$('startButton').addEventListener('click', openCamera);
$('captureButton').addEventListener('click', startCaptureCountdown);
$('retakeButton').addEventListener('click', openCamera);
$('homeFromCamera').addEventListener('click', home);
$('homeFromResult').addEventListener('click', home);
$('qrButton').addEventListener('click', showQr);
$('closeQr').addEventListener('click', () => $('qrDialog').close());
document.addEventListener('visibilitychange', () => { if (document.hidden) stopCamera(); });
playStartVideo();
