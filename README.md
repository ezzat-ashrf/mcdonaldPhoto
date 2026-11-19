# myCIB browser photo booth

This is a normal HTML/CSS/JavaScript site, not Unity WebGL.

## Run locally

Camera access requires `localhost` or HTTPS. From this folder run:

```powershell
python -m http.server 8080
```

Then open `http://localhost:8080`.

## AI avatar endpoint

The `functions/` folder contains a protected Google Cloud HTTPS function using the same Vertex AI project, `gemini-3-pro-image` model, CIB avatar prompt, and style reference as the Unity project. It requires a valid Firebase App Check token and applies a 30-second generation cooldown.

Deploy it to the Unity Vertex project with Google Cloud CLI:

```powershell
gcloud functions deploy generate-avatar --gen2 --project gen-lang-client-0899943261 --region us-central1 --runtime nodejs22 --source functions --entry-point generateAvatar --trigger-http --allow-unauthenticated --memory 1Gi --timeout 300s
```

The deployed function uses its Google Cloud runtime identity, so no Unity private key is published. Register the web app in Firebase App Check with a reCAPTCHA Enterprise score key restricted to `ezzat-ashrf.github.io`. Put the public Firebase web configuration, public reCAPTCHA site key, and returned function URL in `config.js`, then commit/push it. These browser values identify the app but are not private credentials.

The endpoint accepts:

```json
{ "imageBase64": "data:image/jpeg;base64,..." }
```

and returns either `{ "imageBase64": "..." }` or `{ "imageUrl": "https://..." }`.
Never place the service-account JSON or a Gemini API key in this frontend or GitHub repository. If `avatarEndpoint` is blank, the page now reports a clear configuration error instead of silently showing the original capture as though it were an AI result.

## Firebase

The page writes the newest image with `PUT` to `/latest.json`. Firebase rules must permit the site to write. For production QR download links, upload the image to Storage or a backend and return a public/temporary image URL; large base64 images cannot be encoded directly into a QR code.
