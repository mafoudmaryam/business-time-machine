# Business Time Machine: frontend

The app people see: React, TypeScript, Vite and Recharts. The project overview, setup steps and screenshots are in the
[README at the project root](../README.md); this page is only a map of this folder.

## Run it

Start both servers from the **project root** with `.\start.ps1` (see the root README). To work on the frontend alone:

```powershell
cd frontend
npm install
npm run dev        # http://localhost:5173 (needs the backend on port 8000 for real data)
npm test           # Vitest and Testing Library, including vitest-axe accessibility checks
npm run lint       # oxlint
npm run build      # type-checks, then builds to dist/
```

## Where things are

| Path | What it is |
|---|---|
| `src/api.ts` | The one typed client for the backend |
| `src/pages/` | One folder per page (Start, Today, Try, Timeline, Journal, How, Share, and the older Advanced pages) |
| `src/components/` | Shared pieces: top bar, Back button, dialogs, coach card, empty and error states |
| `src/lib/` | Plain functions (formatting, wording, geometry) and their tests |
| `src/theme.css` | **The single place for colours, fonts, shapes and spacing** |
| `src/redesign.css` | The look, loaded last and organised page by page (table of contents at the top) |
| `src/chartTheme.ts` | The one colour system shared by every chart |
| `public/fonts/` | Nunito, Inter and Patrick Hand, served from the app itself |
| `public/images/` | Industry photos and the four start-page photos, with `CREDITS.md` |
| `scripts/make-redesign-images.py` | Turns the four start-page photos into small WebP files (needs Pillow) |

## Rules to keep

- Never write a raw colour outside `theme.css`; a test fails on any old-look colour.
- Amber is for fills, underlines and rings, never for text.
- Confetti only after the owner saves something that succeeded.
- All motion switches off under `prefers-reduced-motion`, and the Share page prints plain black on white.
- Tap targets are at least 44 pixels and nothing scrolls sideways at 390 pixels wide.
