# First-time reader: reproducible legal-audio demo

This is a fresh-reader exercise. Do not request implementation help during the attempt. Record any unclear instruction, failure, workaround or question. Success must be reported by the person who actually followed it; an automated check is recorded separately.

## Prerequisites

- Windows, Git, Node 24.13.x and npm on PATH.
- Internet access for npm, the MongoDB binary and three CC0 audio downloads.
- A recent Chromium browser, speakers/headphones and permission to enable device audio.
- Approximately 2 GB free for project dependencies/demo assets, plus model/runtime storage only if running the optional LLM evaluation.

## Fresh setup

1. Put the project source in a new folder. Do not copy .env, node_modules, data, or anyone else's credentials.
2. Open PowerShell in that folder and run:

```powershell
npm ci
npm run setup
npm run build
node scripts/prepare-acceptance-media.js
node scripts/acceptance-studio.js
```

3. Open the **Disposable legal-audio studio** URL printed by the final command. If port 5173 is occupied, use the actual printed port. Leave PowerShell open. This uses its own temporary MongoDB replica set and audio copies; it does not import to or reset the private library.
4. Create an account with a password of at least 12 characters. Choose **Hydrogen** as the starting track and create a lounge. Copy the invite code.
5. Open a separate private/incognito window at the same URL. Create a different account and join using the invite code.
6. On each device/window, select **Enable audio**. The Host selects **Play**. Confirm Hydrogen is audible and the title agrees in both windows.
7. As Host, search/add **Rubidium**, then **Caesium**. Their publisher-specified BPM/key chain is 132/10B → 132/9B → 130/8B. Check the compatibility labels. Vote as the Listener and verify both queues agree. If voting changes order, reserve Rubidium next so the intended chain remains explicit.
8. As Host, use **Skip / Advance** to hear Rubidium, then Caesium. This quick demo demonstrates genuine audio and validated transitions; it is not a claim that full song durations elapsed. For a natural-end demonstration, repeat the session and allow Hydrogen and Rubidium to finish without advancing. Re-enable audio only if the browser reports blocking.
9. As Listener, ask **What is the BPM tempo?** and inspect the cited profile. Ask **Who won a Nobel prize?** and verify that the answer says there is insufficient metadata. Unless a real local model was configured before startup, answers are explicitly template mode.
10. Send a positive chat message, then a negative one. Observe the score/window behavior; this is a smoke demonstration, not an independent accuracy benchmark.
11. Refresh the Listener window, select the lounge in Overview → recent lounges, and verify the current snapshot/queue after rejoining. A full page reload returns to Overview; it does not automatically reopen a room. Close or leave the Host window and verify playback freezes; rejoin as Host and explicitly resume.
12. Host: Room → Manage room → End session. Open Session analytics and check the track history. Press Ctrl+C in PowerShell to clean up the disposable studio.

## Reader record

Copy `docs/FIRST_READER_RESULT_TEMPLATE.json` outside the repository, fill it truthfully, and return the result. Do not include passwords, tokens, real email addresses, private chat or unrelated screenshots. Record dates, OS/Node/browser, elapsed setup time, step outcomes and whether outside help was needed. If you have previously worked on this project, identify that; you cannot attest to being a first-time reader.

A completed independent record is required before closing this gate. The project author's own run and automated browser tests do not substitute for it.

## Optional real-model portion

Use this only with the disposable CC0 studio above; do not approve or send a private/unlicensed catalog to a model as part of this exercise.

1. Install or run Ollama from its official Windows distribution: https://docs.ollama.com/windows . Verify that `http://127.0.0.1:11434/api/version` responds. Do not start a second server on an occupied port.
2. Pull the locally evaluated model:

```powershell
ollama pull qwen2.5:1.5b-instruct
```

3. Preload it explicitly (cold startup is slower than the application's generation deadline):

```powershell
Invoke-RestMethod -Uri http://127.0.0.1:11434/api/generate -Method Post -ContentType application/json -Body '{"model":"qwen2.5:1.5b-instruct","prompt":"Reply ready.","stream":false,"keep_alive":"10m"}'
$env:OLLAMA_MODEL='qwen2.5:1.5b-instruct'
node scripts/acceptance-studio.js
```

4. Follow the room/track/Q&A steps above. Inspect the visible generation mode; a template fallback is not evidence of model output. Hardware/runtime differences can cause timeouts. Keep the fallback rate and cold/warm distinction in your reader record.
5. For the scripted audit and real monotonic outro-to-DOM measurement, close the disposable manual studio with Ctrl+C, then run `npm run acceptance:model` in that same PowerShell environment. This accelerates logical song positions to collect repeated outro triggers; it does not claim that full song durations elapsed. Cold diagnostics and failed candidate reports remain separate from the final measured model report.
