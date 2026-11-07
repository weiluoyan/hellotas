# UTAS page #77 source and implementation notes

Depends on #72 homepage, #73 menu/responsive fixes, and #75 acknowledgements.

## Design
Figma file VGcE6UfM3pQLvpRrqHGhjk, page 0:1:
- 342:228: UTAS title/share banner
- 339:142: TUSA card
- 340:180: Rubric card
The issue's explicit hero wording takes precedence over the older Figma hero copy.
Existing Journey cards/share banner/gallery are reused; no Figma document changes.

## Content and images
- Club details and existing photographs reuse data/community.yaml and data/journey.yaml, keeping Journey Steps 2 and 3 consistent.
- Rubric official page screenshot: https://campus.hellorubric.com/search?country=AU&state=Tasmania&type=events&universityid=24
- TUSA official upcoming-events screenshot: https://tusa.org.au/events/
Both screenshots captured in local Edge on 7 November 2026 (UTC+8), without login.
No licence/permission claim is made by this implementation.

## Events widget limitation
TUSA events responds with X-Frame-Options: SAMEORIGIN. It cannot be embedded on GitHub Pages as an iframe. The card therefore displays a dated official-page snapshot and a prominent link to the current source schedule, rather than inventing event data or bypassing the embedding restriction. A live widget requires an authorized feed/embed or a confirmed alternate design. This remains a review item; the snapshot is not a live event feed.

## Verification
Hugo build and local installed Edge via Playwright: en/zh/ne at 360, 390, 1440px. Verified seven-card order, six navigation links, active UTAS state, language/channels controls, no broken sourced images, scrollWidth=clientWidth and scrollX=0. Evidence: local TEMP/hellotas77-evidence.
Live preview intentionally remains #75 pending review.
