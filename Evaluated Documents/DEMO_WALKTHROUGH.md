# Multi-Participant Live Demo & Walkthrough Guide

**Deliverable Reference:** PRD §13.1 Final Submission Checklist — Item 7:  
*“Recorded walkthrough or live demo of a multi-participant DJ Lounge session, including one AI segue with Q&A and one Soundclash battle.”*  
**Primary Recording:** [`liquid-glass-demo.webm`](liquid-glass-demo.webm) (6.7 MB WebM video, 1280×900 viewport)  
**Automated Generator:** [`tests/browser/foundation.spec.js`](../tests/browser/foundation.spec.js) (Playwright two-context headless harness)

---

## 1. Demo Walkthrough Overview

The video recording captures a live, synchronized multi-participant session between two independent browser contexts (**Host** and **Guest**) executing on an isolated local MongoDB replica set:

```
[Host Context]                                              [Guest Context]
  │                                                           │
  ├── 1. Register & Login ────────────────────────────────────┤ (Guest registers)
  ├── 2. Preview Local Music Track                            │
  ├── 3. Create Lounge ("After Hours")                        │
  │      └── Generate Invite Code ───────────────────────────►├── 4. Join via Invite Code
  │                                                           │
  ├── 5. Enable Audio & Press Play ◄──────────────────────────┼── Synchronized Playback
  │                                                           │
  ├── 6. Add Tracks to Queue ─────────────────────────────────┤
  │      └── "Night Geometry" & "After the Rain"              │
  │                                                           │
  │◄────────────────── 7. Queue Voting ───────────────────────┼── Upvote "After the Rain"
  │    (Real-time DOM sync latency < 100 ms)                  │
  │                                                           │
  ├── 8. AI DJ Segue Suggestion ──────────────────────────────┤
  │      ├── Generate Harmonic Suggestion                     │
  │      ├── Host Reviews & Approves Segue                    │
  │      └── Advance Queue to "Night Geometry"                │
  │                                                           │
  │◄──────────────── 9. Grounded Track Q&A ───────────────────┼── "What is the BPM tempo?"
  │      └── Citations: "BPM tempo: 124."                     │   "Who won a Nobel prize?"
  │      └── Refusal: "Insufficient authored metadata."       │
  │                                                           │
  │◄──────────────── 10. Social Chat & Sentiment ─────────────┼── "I really love this track"
  │      ├── Typing Indicator ("Guest is typing…")            │   (XSS payload sanitized)
  │      ├── Sentiment Score -> "Positive"                    │
  │      └── Reaction: Host reacts 🔥 to Guest message       │
  │                                                           │
  ├── 11. Soundclash Battle Arena ────────────────────────────┼── Guest enters candidate
  │      ├── Host submits candidate track                     │
  │      ├── Host opens 10-second voting round                │
  │      ├── Guest votes for "After the Rain"                 │
  │      └── Battle resolves: Winner reserves Next Up!        │
  │                                                           │
  ├── 12. Mobile Responsive Viewport (390×844)                │
  │      ├── Bottom tab navigation across sections            │
  │      ├── Persistent compact player & mini-controls        │
  │      └── Draft message preserved across view changes      │
  │                                                           │
  └── 13. End Session & Analytics Recap ──────────────────────┴── Session summary
```

---

## 2. Key Timestamp Milestones

| Approximate Timing | Feature Demonstrated | Screen Actions & Assertions Verified |
| :---: | :--- | :--- |
| **00:00 – 00:08** | **Account Creation & Catalog Preview** | Host creates an account, searches the local music library, inspects track duration and metadata, and tests audio playback preview. |
| **00:08 – 00:15** | **Track Selection & Lounge Creation** | Host selects a starting seed track using the searchable [`TrackPicker.jsx`](../client/src/TrackPicker.jsx), sets lounge vibe to *"After Hours"*, and creates the lounge. |
| **00:15 – 00:22** | **Guest Join & Synchronized State** | Guest enters the generated invite code and joins. Both participants verify identical connection state, member counts, and monotonic clock synchronization. |
| **00:22 – 00:30** | **Synchronized Audio & Queue Enqueue** | Both clients click *Enable audio*. Host clicks *Play*; audio begins streaming synchronously. Host enqueues *"Night Geometry"* and *"After the Rain"*. |
| **00:30 – 00:40** | **Real-Time Queue Voting** | Guest upvotes *"After the Rain"*. The queue reorders deterministically; revision applied to both client DOMs in under 50 ms. |
| **00:40 – 00:50** | **AI DJ Segue & Harmonic Transition** | Host clicks *Suggest segue*. The AI DJ ranks eligible candidates using Camelot/BPM rules and presents an explanation. Host clicks *Approve next track*, reserving it in Next Up, then advances playback. |
| **00:50 – 01:00** | **Grounded Track Q&A (RAG)** | Guest asks *"What is the BPM tempo?"* $\to$ AI DJ replies with cited authored metadata: *"BPM tempo: 124."*<br>Guest asks *"Who won a Nobel prize?"* $\to$ AI DJ honestly refuses: *"Insufficient authored metadata to answer this question."* |
| **01:00 – 01:10** | **Chat, Live Sentiment & Reactions** | Guest types in chat; Host observes live typing indicator (*"Guest is typing…"*) and sends a message containing an XSS payload (`<script>alert(1)</script>`), which renders safely escaped. Sentiment badge transitions to **Positive**. Host clicks 🔥 reaction, updating the count in real time. |
| **01:10 – 01:25** | **Soundclash Battle Arena** | Host submits *"Study in Amber"*; Guest submits *"After the Rain"*. Host opens a 10-second voting window. Guest votes. When the timer expires, the battle resolves, declares the winner in chat, and reserves the winning track in the live queue. |
| **01:25 – 01:40** | **Mobile Responsiveness & Mini-Player** | Guest window scales to mobile dimensions (390×844). Demonstrates 5-section tabbed navigation, sticky mini-player controls, and persistent message drafts surviving navigation. |
| **01:40 – 01:50** | **Session End & Analytics** | Host ends the lounge. Both clients navigate to *Session Analytics* and inspect the session recap: total duration, peak participants, battle outcomes, and rolling sentiment timeline. |

---

## 3. How to Reproduce or Re-Record the Demo

The entire walkthrough is 100% automated and reproducible using Playwright:

```powershell
# 1. Install Chromium browser binaries if not present
npx playwright install chromium

# 2. Run the automated multi-context walkthrough test
npm run test:e2e -- tests/browser/foundation.spec.js

# 3. The newly captured video is automatically output to:
# evidence/demo/page@<hash>.webm
```
