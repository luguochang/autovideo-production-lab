# Standard Pipeline Status - batch-smoke-30s-20260720

- Updated: 2026-07-22T15:00:08.852Z
- Run status: `complete`
- Route: `script`
- Formal project: `hyperframes-workflow-kit/projects/batch-smoke-30s-20260720`
- Detailed append-only log: `RUN_EXECUTION_LOG.md`
- Policy: automated approvals remain internal-only; human listening, human final review and public rights are never synthesized.

| Seq | Stage | Status | Revision | Approval scope | Latest result |
|---:|---|---|---:|---|---|
| 1 | source-register | approved | 1 | machine | Verified immutable narration input from formal project. |
| 2 | material-suitability | approved | 1 | machine | Registered sources can enter spoken rewriting after human review. |
| 3 | evidence-ledger | approved | 1 | human-review | Extracted 3 source-bound claim(s) with prompt provenance. |
| 4 | spoken-rewrite | approved | 2 | machine | Prepared 1 source-bound spoken section(s) for review. |
| 5 | content-duration-fit | approved | 1 | machine | Text duration budget passed at 6.23 graphemes/s; final WAV timing remains authoritative. |
| 6 | claim-source-review | approved | 2 | machine | passed: 0 claim/source issue(s). |
| 7 | script-review | approved | 2 | human-review | Prepared narration for small manual edits and approval. |
| 8 | content-approval | approved | 2 | human-review | Content chain is ready for explicit human wording approval. |
| 9 | narration-lock | approved | 2 | machine | Rebound the unchanged narration to the current content approval and archived the prior lock revision. |
| 10 | template-lock | approved | 2 | machine | Locked approved template modern-ip-host-explainer@1.0.0 with palette light-apricot. |
| 11 | pronunciation-review | approved | 1 | machine-no-subjective-terms | No subjective Latin terms required probes; generated a hash-bound machine approval for explicit letter acronyms only. |
| 12 | voice-final | approved | 2 | technical-only | Promoted candidate-003 for internal-only technical simulation; human listening was not performed. |
| 13 | audio-align | approved | 3 | machine | Mapped 140 Whisper timestamps to 158 exact NarrationLock characters and 6 caption cues; generated locked SRT and technical audio QA (-16 LUFS). Phoneme-level forced alignment remains a documented limitation. |
| 14 | subtitle-qa | approved | 4 | machine | Subtitle machine QA passed for 6 cues; human semantic review and OCR remain separate gates. |
| 15 | subtitle-review | approved | 3 | internal-autonomous-review | Accepted subtitle-review for internal-only production under creator delegation; human review was not performed. |
| 16 | rights-clearance | approved | 3 | internal-autonomous-review | Prepared publication rights v2 review with 18 item(s) and 5 current inventory binding(s). |
| 17 | audio-handoff | approved | 4 | machine | Attached final audio (31.807896s) and alignment with rights=needs-review. |
| 18 | visual-plan | approved | 6 | internal-autonomous-review | Imported formal planning SSOT with 2 scene(s), 2 graph(s), and 6 shot(s). |
| 19 | diagram-assets | approved | 2 | machine | Computed ELK layouts for 2 canonical planning graph(s). |
| 20 | style-probe | approved | 4 | internal-autonomous-review | Imported the hash-bound 3.98s style probe for internal review. |
| 21 | visual-variety-qa | approved | 3 | machine | Visual variety QA passed: 3 carriers and 3 recipes across 6 cues. |
| 22 | composition-readiness | approved | 5 | machine | Technical checks passed for internal-only composition; public release remains blocked. |
| 23 | full-production | approved | 4 | machine | Compiled 2 scenes and 6 locked cues into a 31.808s HyperFrames composition. |
| 24 | qa-review | approved | 4 | machine | HyperFrames strict check passed. Final MP4 media QA remains after render. |
| 25 | screen-text-review | approved | 2 | internal-autonomous-review | Accepted screen-text-review for internal-only production under creator delegation; human review was not performed. |
| 26 | final-preview | approved | 2 | internal-autonomous-review | Accepted final preview for internal-only rendering; human final review was not performed. |
| 27 | render-deliver | approved | 2 | machine | Rendered and decoded an internal-review MP4; public release remains blocked. |
| 28 | delivery-qa | approved | 3 | machine | Delivery master passed media QA; generated cover, 4 review frames and the delivery manifest inputs. Retrospective finalizes the complete SHA-256 manifest. |
| 29 | retrospective | approved | 3 | internal-autonomous-review | Created the UTF-8 retrospective, finalized the delivery manifest, and synchronized SOP status. |
| 30 | package-export | approved | 8 | machine | Assembled and verified the 642-file standard delivery package (internal-only; public release blocked=true). |
