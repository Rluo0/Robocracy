# ROBOT ROYALE — Master creative, product, and pitch plan

## North star

Turn an ordinary group decision into a ridiculous robot battle that people can watch together. The result must be useful and obvious; the experience must be hilarious, spontaneous, and full of arcade mayhem. Think the chaotic party energy of Fall Guys, expressed through silly 2D robots.

This is a high-level handoff for Richard, Gail, and their Claude agents. It does not prescribe a stack or overwrite existing implementation choices. ROBOT ROYALE is the creative name supplied in the handoff; the repository is `rluo/robocracy`. Any final public naming decision remains with the team.

## Finalized product direction

- A 2D arcade robot auto-battler: participants submit choices, then robots resolve the battle automatically.
- Duplicate choices form factions automatically when the host enables teams.
- Larger factions are stronger. The exact strength formula is an implementation and tuning decision.
- Random powerups spawn around the arena and can produce dramatic comebacks for weaker factions.
- The host can disable factions and run free-for-all (FFA).
- Sound design and music are core to the experience.
- The pitch lasts three minutes, begins with a staged argument, and includes one live audience battle for the team's people's-choice vote.

See [the brainstorming transcript](ROBOT_ROYALE_BRAINSTORM_TRANSCRIPT.md) for available verbatim source turns and explicit export gaps. Suggestions below are proposed execution choices, not quotations or previously finalized decisions.

## The product loop

1. A host creates a decision session with a clear question and selects factions or FFA.
2. Participants join, identify themselves, and submit the decision they support.
3. The lobby makes each choice and its supporters visible.
4. The host starts a short, automatic battle.
5. Robots collide, fight, and collect chaotic powerups while viewers follow their choice.
6. The result clearly names the winning choice, and the host can start another decision.

In factions mode, duplicate choices share an allegiance and cannot eliminate their own faction. Show faction identity, supporter count, and strength clearly enough that someone watching a projector can understand them. A larger faction should visibly have an advantage, while a lucky smaller faction can still win.

In FFA, entrants compete independently. The live vote challenge needs exactly one winner. Decide before rehearsal how each audience entrant represents a hackathon project and how duplicates are handled without creating shared winners.

## Creative direction

Make the robots goofy and expressive. Use readable silhouettes, exaggerated impacts, funny movement, bright faction cues, and absurd powerup effects. Chaos should remain legible: viewers must be able to follow the contenders and understand the winner.

Proposed powerup examples include a giant boxing glove, temporary invincibility, a speed burst, and an explosive knockback attack. Choose a small set with distinct visual and audio cues. These examples are optional, not a required feature list.

Prioritize a few memorable surprises over many indistinguishable effects. Escalation should help end the round rather than leave the audience waiting indefinitely.

## Music and sound are part of the demo

Prepare energetic battle music, a countdown cue, robot movement and impact sounds, unmistakable powerup cues, elimination reactions, and a satisfying victory sting. The lobby can have lighter music so the battle feels like an escalation.

Keep presenters audible. Test browser audio activation, playback on the actual presentation setup, music level, and a visible mute or volume control. Sound should add energy without obscuring the explanation. Use assets the team can legitimately include.

## Practical MVP priorities

First make a complete session work: join, submit, display choices, start, battle, announce a clear result, and reset. Then make faction formation, faction strength, comeback powerups, and FFA work in that same loop. Add the audio and visual personality early enough to rehearse with it.

The demo is ready when a new participant can join without coaching, the projected arena is readable, the host can start reliably, and a round finishes within the pitch budget. Avoid expanding into accounts, progression, cosmetics stores, multiple maps, or complex customization unless the complete demo is already stable.

## Three-minute people's-choice pitch

The following timing is a proposed rehearsal target, totaling 180 seconds.

| Time | Beat | Purpose |
| --- | --- | --- |
| 0:00–0:20 | Ayden and Gail stage a quick argument over a mundane choice. | Establish the problem and get a laugh. |
| 0:20–0:40 | Introduce ROBOT ROYALE and reveal the robots; Richard joins one side. | Show duplicate choices forming a stronger faction. |
| 0:40–0:55 | Explain automatic battles, random comeback powerups, and the host's FFA setting. | Make the rules understandable without a feature lecture. |
| 0:55–1:20 | Switch to FFA and invite the audience to enter contenders for the team's vote. | State the stakes and collect entries. |
| 1:20–2:10 | Run the single live audience battle. | Let the product deliver the spectacle. |
| 2:10–2:35 | Reveal the sole winner and honor the stated vote commitment. | Demonstrate a real decision being resolved. |
| 2:35–3:00 | Close with the everyday use case and the people's-choice ask. | Land the value and finish on time. |

Suggested opening: “We couldn't agree on what to choose. So we built robots to fight about it.”

Suggested transition: “We believe in this enough to let it decide our vote. Teams off. One winner.”

Suggested close: “Dinner plans, party arguments, or our hackathon vote: submit your choice and let the robots settle it.”

Show faction formation during the opening without running a second full battle. The current handoff calls for one live audience battle. Have the join link or QR code visible early, and rehearse the exact wording of the vote commitment so the audience knows what winning means.

## Rehearsal and fallback

Rehearse the full 180 seconds with real devices, a projector-sized view, music, and enough entrants to resemble the audience. Verify duplicate faction formation, a larger faction's advantage, a plausible underdog comeback, FFA producing one winner, and reset behavior.

Agree on a firm entry cutoff and a round duration that fits the schedule. Resolve empty sessions, everyone choosing the same option, simultaneous eliminations, ties, late joins, and lost connections before the live pitch. These are open product rules to define, not established mechanics from the transcript.

Prepare a clearly labeled recorded demo or preloaded practice session if connectivity fails. Do not present prerecorded results as live. Keep the close ready even if the live demonstration must be shortened.

## Coordination for Claude agents

Read the current repository and its instructions before implementing. Preserve existing work and choose the smallest changes that complete the product loop. Richard and Gail should agree on shared session, participant, choice, faction, battle, and result concepts before concurrent implementation.

Suggested work areas are the host/join flow, battle behavior, visual/audio presentation, and pitch readiness. Ownership and technical boundaries are for the team to decide. Use isolated changes and review integration points; do not let multiple agents overwrite the same files unknowingly.

## Decisions still open

- Exact faction strength and comeback balance.
- How duplicate choice text is normalized or confirmed.
- Round duration, battle-ending rules, and tie resolution.
- Audience representation and duplicate handling in FFA.
- Entrant capacity, host controls, and disconnect behavior.
- Final public name and exact pitch dialogue.

The exported “1. A 2. A 3 hmm undecided” response has no available question context. Do not infer additional product decisions from those letters.

