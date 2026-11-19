# myCIB browser photo booth

This is a normal HTML/CSS/JavaScript site, not Unity WebGL.

## Run locally

Camera access requires `localhost` or HTTPS. From this folder run:

```powershell
python -m http.server 8080
```

Then open `http://localhost:8080`.

## AI avatar endpoint

Set `avatarEndpoint` near the top of `app.js`. It must be a secure backend that accepts:

```json
{ "imageBase64": "data:image/jpeg;base64,..." }
```

and returns either `{ "imageBase64": "..." }` or `{ "imageUrl": "https://..." }`.
Never place a Gemini API key in this frontend.

When `avatarEndpoint` is blank, the captured photo is used as the result so the complete kiosk flow can be tested immediately.

## Firebase

The page writes the newest image with `PUT` to `/latest.json`. Firebase rules must permit the site to write. For production QR download links, upload the image to Storage or a backend and return a public/temporary image URL; large base64 images cannot be encoded directly into a QR code.
