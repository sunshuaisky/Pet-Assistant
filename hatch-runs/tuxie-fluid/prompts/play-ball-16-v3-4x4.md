Create a 16-frame Tuxie playing-with-ball sprite source arranged as a clean 4-row by 4-column grid.

This replaces the previous version because frames were inconsistent in size and some cells included the previous frame's tail. The new source must prioritize clean separation and identical scale over dramatic motion.

Layout requirements:
- Exactly 16 frames total arranged in 4 rows and 4 columns.
- Reading order is row-major: row 1 frames 0-3, row 2 frames 4-7, row 3 frames 8-11, row 4 frames 12-15.
- Every cell must contain exactly one complete Tuxie and one small red toy ball.
- Keep the cat and ball centered inside each cell with a large pure cyan safety margin on all four sides.
- No tail, paw, ear, ball, outline, or whisker may touch a cell edge or enter a neighboring cell.
- No visible grid lines. No frame numbers. No digits. No labels. No text. No captions. No UI marks. No guide marks.
- Use a perfectly flat pure #00FFFF chroma-key background across the whole image.

Scale lock:
- Tuxie's body must remain the same size in all 16 frames.
- Keep head size, body size, tail thickness, eye size, outline thickness, and ball scale consistent frame to frame.
- Do not zoom in or zoom out between frames.

Identity lock:
- Preserve Tuxie's black-and-white exotic shorthair-style cat identity: round flat face, yellow-green eyes, pink nose, white muzzle and chest, black cap over ears/head, black saddle patches, compact chibi body, tiny legs, and gentle curious expression.

Motion design:
- Seamless loop: frame 0 and frame 15 must be nearly identical reset poses.
- Smooth 16-frame motion: notice ball, paw raises, paw touches ball, small nudge, crouch, tiny pounce, ball stays touching paw/body, follow-through, recover, return to upright reset.
- The ball must touch or partly overlap Tuxie's paw/body in every frame; never floating alone.

Style:
- Codex digital pet sprite style: pixel-art-adjacent low-resolution mascot, chunky readable silhouette, thick dark 1-2 px outline, visible stepped/pixel edges, limited palette, flat cel shading.

Forbidden:
- No detached balls, duplicate balls, tails from neighboring frames, partial duplicate body parts, rolling trails, dust, shadows, motion lines, sparkles, text, labels, numbers, UI, speech/thought bubbles, guide marks, checkerboard transparency, white/black background, floor patch, glow, blur, scenery, or #00FFFF inside Tuxie/ball.
