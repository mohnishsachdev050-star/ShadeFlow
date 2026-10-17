# ShadeFlow AI

A browser-based room colour visualiser with local wall/ceiling segmentation, a shade catalogue, a built-in rule-based shade helper, and an Asian Paints nearby-store finder.

## Run locally

Requires Node.js 20 or newer. From this folder run:

```bash
npm install
npm start
```

Then open http://localhost:3000. The segmentation model is downloaded by the browser on first use.

## Deploy on Render

Create a **Web Service** from this repository. Use build command `npm install` and start command `npm start`.

## Notes

- No OpenAI or Gemini API is used.
- The sample room is included as both `sample-room.png` at the repository root and `images/sample-room.png` for compatibility.
- The store finder attempts to retrieve public listings from official Asian Paints locator pages; availability depends on those pages and their response format.
- Never commit real secrets or `.env` files.
