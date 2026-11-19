# myCIB browser photo booth

This is a normal HTML/CSS/JavaScript site, not Unity WebGL.

## Run locally

Camera access requires `localhost` or HTTPS. From this folder run:

```powershell
python -m http.server 8080
```

Then open `http://localhost:8080`.

## AI avatar endpoint

The `functions/` folder contains a secure Firebase HTTPS function using the same Vertex AI project, `gemini-3-pro-image` model, CIB avatar prompt, and style reference as the Unity project.

Install and authenticate Firebase CLI, then store the Unity service account as a Firebase secret (never commit it):

```powershell
npm install -g firebase-tools
firebase login
firebase functions:secrets:set GOOGLE_SERVICE_ACCOUNT_JSON
firebase deploy --only functions
```

When prompted for the secret value, paste the complete contents of the Unity project's `Assets/StreamingAssets/service-account.json`. After deployment, paste the returned `generateAvatar` HTTPS URL into `config.js` and commit/push `config.js`.

The endpoint accepts:

```json
{ "imageBase64": "data:image/jpeg;base64,..." }
```

and returns either `{ "imageBase64": "..." }` or `{ "imageUrl": "https://..." }`.
Never place the service-account JSON or a Gemini API key in this frontend or GitHub repository. If `avatarEndpoint` is blank, the page now reports a clear configuration error instead of silently showing the original capture as though it were an AI result.

## Firebase

The page writes the newest image with `PUT` to `/latest.json`. Firebase rules must permit the site to write. For production QR download links, upload the image to Storage or a backend and return a public/temporary image URL; large base64 images cannot be encoded directly into a QR code.
