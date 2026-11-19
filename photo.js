'use strict';

(async () => {
  const message = document.getElementById('message');
  const photo = document.getElementById('photo');
  const download = document.getElementById('download');
  const id = new URLSearchParams(location.search).get('id') || '';
  if (!/^[A-Za-z0-9-]{8,80}$/.test(id)) {
    message.textContent = 'This photo link is invalid.';
    return;
  }
  try {
    const response = await fetch(`https://photo-game-2f638-default-rtdb.firebaseio.com/photos/${encodeURIComponent(id)}.json`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Photo service returned ${response.status}`);
    const result = await response.json();
    if (!result || result.id !== id || typeof result.imageBase64 !== 'string') throw new Error('Photo not found');
    photo.src = result.imageBase64.startsWith('data:') ? result.imageBase64 : `data:image/jpeg;base64,${result.imageBase64}`;
    photo.hidden = false;
    download.href = photo.src;
    download.classList.add('ready');
    message.hidden = true;
  } catch (error) {
    message.textContent = 'This photo is unavailable. Please create a new QR code.';
    console.error(error);
  }
})();
