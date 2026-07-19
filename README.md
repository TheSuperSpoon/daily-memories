# For Mel birthday website

Quick edits:

- After password unlock, the Chinese love-letter prelude appears as a paper-textured letter before the main site. Five clickable `光` characters must be lit before the homepage fades in.
- To replay the prelude while testing, click `Lock` on the homepage and unlock again. Locking clears the saved prelude completion.
- Edit the prelude wording in the `#lovePrelude` section of `index.html`; keep the five `.light-word` buttons if you want the current completion logic.
- The prelude includes a hidden Cyberpunk: Edgerunner ticket stub. Edit `#ticketOverlay` in `index.html` for ticket text and the `.ticket-*` CSS rules in `styles.css` for visuals.
- The old second-stage `Letter` tab/page has been removed; the opening prelude is now the only love-letter experience.
- The `微光收集` page is a front-end/localStorage prototype starting from `2026-07-20`. It includes the lighthouse calendar, dual upload states, local gallery timeline, streak counter, backpack, retroactive cards, star background, and plant growth states.
- Real two-user accounts, cross-device sync, and durable photo uploads require a backend/storage service such as Supabase or Firebase. The current prototype stores photos only in the current browser.
- Edit the panoramic homepage sequence directly in `index.html`.
- The homepage images live in `outputs/assets/`: `jinx.png`, `yoru.jpg`, `fleabag.jpg`, `dead-poets.jpg`, `the-strokes.jpg`, and `gojira.jpg`.
- To reorder the scroll sequence, reorder both the `.panorama-frame` images and matching `.panorama-step` text blocks in `index.html`.
- The Mel Planet content is now on the `Planet` tab and is intentionally relationship-focused rather than repeating the homepage hobbies.
- Change the animated "I love you" placeholder count by editing `data-count-target="520"` in `index.html`.
- Replace timeline text in the `memories` array in `script.js`.
- Add timeline photos by placing images in `outputs/assets/`, then setting a memory's `image` value, for example `image: "./assets/first-date.jpg"`.
- Rewrite the clickable love-letter pieces in the `letterPieces` array in `script.js`.
- Edit homepage wording and portal cards in `index.html`.
- Current homepage concept: pure-black gallery with nine inset image frames. Images are dim/desaturated away from the viewport center, then regain warm color under a circular spotlight as they reach the center, with subtle vertical parallax.
- Current Planet placeholder concept: Bad Decisions, singer/drummer, 3/29, September long distance, and a two-year promise section.
- Planet tab has a purple canvas particle effect. Edit `activatePlanetParticles`, `seedPlanetParticles`, and `drawPlanetParticles` in `script.js` to tune density, speed, and bloom.
- Put your chosen song at `outputs/assets/your-song.mp3`, or change the `<audio>` path in `index.html`.

The password is client-side, so it is good for a personal surprise but not for sensitive secrets.
