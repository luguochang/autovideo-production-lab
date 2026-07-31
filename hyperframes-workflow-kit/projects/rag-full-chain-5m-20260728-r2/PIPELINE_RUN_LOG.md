# Standard Pipeline Status - rag-full-chain-5m-20260728-r2

- Updated: 2026-07-29T07:52:54.862Z
- Run status: `complete`
- Route: `script`
- Formal project: `hyperframes-workflow-kit/projects/rag-full-chain-5m-20260728-r2`
- Detailed append-only log: `RUN_EXECUTION_LOG.md`
- Policy: automated approvals remain internal-only; human listening, human final review and public rights are never synthesized.

| Seq | Stage | Status | Revision | Approval scope | Latest result |
|---:|---|---|---:|---|---|
| 1 | source-register | approved | 1 | machine | Registered 1 source file(s) with SHA-256 receipts. |
| 2 | material-suitability | approved | 1 | machine | Registered sources can enter spoken rewriting after human review. |
| 3 | evidence-ledger | approved | 1 | human-review | Extracted 83 source-bound claim(s) with prompt provenance. |
| 4 | spoken-rewrite | approved | 1 | machine | Prepared 1 source-bound spoken section(s) for review. |
| 5 | content-duration-fit | approved | 1 | machine | Text duration budget passed at 6.26 graphemes/s; final WAV timing remains authoritative. |
| 6 | claim-source-review | approved | 1 | machine | passed: 0 claim/source issue(s). |
| 7 | script-review | approved | 1 | human-review | Prepared narration for small manual edits and approval. |
| 8 | content-approval | approved | 1 | human-review | Content chain is ready for explicit human wording approval. |
| 9 | narration-lock | approved | 1 | machine | Created formal video project and immutable NarrationLock. |
| 10 | template-lock | approved | 1 | machine | Locked approved template modern-ip-host-explainer@1.0.0 with palette light-apricot. |
| 11 | pronunciation-review | approved | 3 | user-directed-selection-no-listening | Accepted all current pronunciation selections by explicit user direction; remaining candidate listening was skipped and public release stays blocked. |
| 12 | voice-final | approved | 1 | human-listening | Promoted candidate-001 as the unique final narration after hash-bound A/B listening review. |
| 13 | audio-align | approved | 1 | machine | Mapped 8083 Whisper timestamps (reused current ASR evidence) to 8976 exact NarrationLock characters and 237 caption cues; generated locked SRT and technical audio QA (-16 LUFS). Phoneme-level forced alignment remains a documented limitation. |
| 14 | subtitle-qa | approved | 1 | machine | Subtitle machine QA passed for 237 cues; human semantic review and OCR remain separate gates. |
| 15 | subtitle-review | approved | 1 | human-review | Approved subtitle-review through its dedicated hash-bound checklist. |
| 16 | rights-clearance | approved | 2 | human-review | Prepared publication rights v2 review with 6 item(s) and 4 current inventory binding(s). |
| 17 | audio-handoff | approved | 1 | machine | Attached final audio (1880.218458s) and alignment with rights=needs-review. |
| 18 | visual-plan | approved | 3 | human-review | Imported formal planning SSOT with 71 scene(s), 13 graph(s), and 237 shot(s). |
| 19 | diagram-assets | approved | 1 | machine | Computed ELK layouts for 13 canonical planning graph(s). |
| 20 | style-probe | approved | 2 | human-review | Imported the hash-bound 5.16s style probe for internal review. |
| 21 | visual-variety-qa | approved | 1 | machine | Visual variety QA passed: 5 carriers and 5 recipes across 237 cues. |
| 22 | composition-readiness | approved | 1 | machine | Technical checks passed for internal-only composition; public release remains blocked. |
| 23 | full-production | approved | 3 | machine | Compiled 71 scenes and 237 locked cues into a 1880.218s HyperFrames composition. |
| 24 | qa-review | approved | 1 | machine | HyperFrames strict check passed. Final MP4 media QA remains after render. |
| 25 | screen-text-review | approved | 1 | internal-autonomous-review | Accepted screen-text-review for internal-only production under creator delegation; human review was not performed. |
| 26 | final-preview | approved | 1 | internal-autonomous-review | Accepted final preview for internal-only rendering; human final review was not performed. |
| 27 | render-deliver | approved | 2 | machine | Repackaged the locked WAV at -1.8 dB with H.264 stream copy; full decode, video-stream identity and loudness checks passed. |
| 28 | delivery-qa | approved | 1 | machine | Delivery master passed media QA; generated cover, 4 review frames and the delivery manifest inputs. Retrospective finalizes the complete SHA-256 manifest. |
| 29 | retrospective | approved | 1 | internal-autonomous-review | Created the UTF-8 retrospective, finalized the delivery manifest, and synchronized SOP status. |
| 30 | package-export | approved | 1 | machine | Assembled and verified the 2376-file standard delivery package (internal-only; public release blocked=true). |
