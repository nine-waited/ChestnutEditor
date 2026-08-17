Source artwork for **OS icons** (window / taskbar / exe / installer): `branding/chestnut-transparent.png`.

Regenerate Windows / macOS / Linux icons:

```powershell
cd apps/desktop
pnpm logo:os
```

(`logo:os` pads the cutout to a square `branding/chestnut-os-icon.png`, then runs `tauri icon`.)

For re-processing from a cream-background photo first, use `pnpm logo:process`. In-app toolbar keeps the **Chestnut** text brand; do not use these files for in-app UI.

Keep branding sources under `branding/` (not `public/`) so Vite does not ship them in the install package. Runtime web favicon stays at `public/favicon.png`.
