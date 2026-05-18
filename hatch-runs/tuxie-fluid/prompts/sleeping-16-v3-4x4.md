Create a 16-frame Tuxie sleeping sprite source arranged as a clean 4-row by 4-column grid.

This replaces the previous version because frames were inconsistent in size and some cells included the previous frame's tail. The new source must prioritize clean separation, identical scale, and unmistakable sleeping.

Layout requirements:
- Exactly 16 frames total arranged in 4 rows and 4 columns.
- Reading order is row-major: row 1 frames 0-3, row 2 frames 4-7, row 3 frames 8-11, row 4 frames 12-15.
- Every cell must contain exactly one complete sleeping Tuxie.
- Keep the cat centered inside each cell with a large pure cyan safety margin on all four sides.
- No tail, paw, ear, outline, or whisker may touch a cell edge or enter a neighboring cell.
- No visible grid lines. No frame numbers. No digits. No labels. No text. No captions. No UI marks. No guide marks.
- Use a perfectly flat pure #00FFFF chroma-key background across the whole image.

Scale lock:
- Tuxie's body must remain the same size in all 16 frames.
- Keep head size, body size, tail thickness, outline thickness, and curled silhouette consistent frame to frame.
- Do not zoom in or zoom out between frames.

Identity lock:
- Preserve Tuxie's black-and-white exotic shorthair-style cat identity: round flat face, pink nose, white muzzle and chest, black cap over ears/head, black saddle patches, compact chibi body, tiny legs, and thick outline.

Motion design:
- Tuxie must be curled or lying down asleep in every frame, with both eyes closed in every frame.
- Seamless loop: frame 0 and frame 15 must be nearly identical curled sleeping poses.
- Smooth 16-frame motion: very subtle slow breathing only, chest/body rise and fall by tiny increments, whiskers relax, tail settles, then return to the same curled pose.
- Never look awake, alert, sitting, standing, eating, playing, or thinking.

Style:
- Codex digital pet sprite style: pixel-art-adjacent low-resolution mascot, chunky readable silhouette, thick dark 1-2 px outline, visible stepped/pixel edges, limited palette, flat cel shading.

Forbidden:
- No open eyes, no alert posture, no props, no bed, no blanket, no pillow, no Z letters, no moon/stars, no tails from neighboring frames, no partial duplicate body parts, no shadows, no motion lines, no sparkles, no text, no labels, no numbers, no UI, no guide marks, no checkerboard transparency, no white/black background, no floor patch, no glow, no blur, scenery, or #00FFFF inside Tuxie.
