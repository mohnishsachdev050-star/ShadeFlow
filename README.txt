SHADEFLOW — LOCAL WALL COLOUR VISUALISER + ASIAN PAINTS STORE FINDER
===================================================================

FEATURES
- Browser-side wall and ceiling segmentation using the client-side model loader (model downloads on first use).
- Separate wall and ceiling colour previews, manual mask correction, and local shade recommendations.
- Search the included Asian Paints Book of Colours 2015 catalogue by name or code.
- Asian Paints dealer-finder panel using current-location permission, live retrieval attempts against official Asian Paints locator pages, with 20 km filtering when the source provides distance, plus Call, Website, and Open directions actions when available.
- No OpenAI API integration is included.

RUN LOCALLY
1. Install Node.js 20 or newer.
2. Extract this ZIP and open a terminal in the ShadeFlowAI folder.
3. Run: npm install
4. Run: npm start
5. Open http://localhost:3000

STORE FINDER NOTES
The store endpoint attempts to read public store cards from the official Asian Paints Colourideas and Colour Cube locator pages using the visitor’s coordinates. Only cards with a source-provided distance of 20 km or less are returned. This integration depends on the official pages continuing to expose readable listing markup; if their layout or access rules change, the finder falls back to the official locator link. Browser location requires permission and generally works on localhost or HTTPS.

WALL DETECTION LIMITATIONS
The generic SegFormer ADE20K model is not trained specifically for repainting and may confuse walls with ceilings, furniture, windows, or shadows. Review results and use the manual correction brush. The first model download may take a while. Local segmentation does not send the room photo to a paid AI API.

CATALOGUE NOTE
The included catalogue is extracted from the supplied Asian Paints Book of Colours / Interiors 2015 PDF. It is historical, current product availability is not guaranteed, and digital HEX values are approximate previews rather than calibrated official paint values. Confirm shades with current manufacturer information and physical shade cards.

CHECKS
Run npm install, npm run check, then npm start. Manually test photo upload, detection, colour previews, current-location store search, and Buy online links in the browser.


Recent updates:
- PIN-code/area input removed; nearby-store search uses current browser location only.
- Added extra shades from the user-provided Asian Paints Popular Color Shades & Codes PDF. HEX swatches are approximate because the PDF does not provide calibrated digital values.
- Each shade includes a Buy online link that searches Amazon India by Asian Paints shade name and code; availability and exact product match depend on Amazon search results.
