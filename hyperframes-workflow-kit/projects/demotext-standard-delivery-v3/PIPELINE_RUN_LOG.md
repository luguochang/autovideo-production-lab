# Standard Pipeline Status - demotext-standard-delivery-v3

- Updated: 2026-07-19T09:21:51.694Z
- Run status: `complete`
- Route: `script`
- Formal project: `hyperframes-workflow-kit/projects/demotext-standard-delivery-v3`
- Detailed append-only log: `RUN_EXECUTION_LOG.md`
- Policy: automated approvals remain internal-only; human listening, human final review and public rights are never synthesized.

| Seq | Stage | Status | Revision | Approval scope | Latest result |
|---:|---|---|---:|---|---|
| 1 | source-register | approved | 1 | machine | Registered 1 source file(s) with SHA-256 receipts. |
| 2 | script-review | approved | 2 | user-provided-input | Prepared narration for small manual edits and approval. |
| 3 | narration-lock | approved | 1 | machine | Created formal video project and immutable NarrationLock. |
| 4 | template-lock | approved | 1 | machine | Locked approved template modern-ip-host-explainer@1.0.0 with palette light-apricot. |
| 5 | voice-final | approved | 1 | technical-only | Generated the final narration WAV in 18 part(s). Human listening approval is required. |
| 6 | audio-align | approved | 1 | machine | Mapped 1149 Whisper timestamps to 1378 exact NarrationLock characters and 46 caption cues; phoneme-level forced alignment remains a documented limitation. |
| 7 | rights-clearance | approved | 1 | internal-autonomous-review | Prepared publication rights review with 7 item(s). |
| 8 | audio-handoff | approved | 1 | machine | Attached final audio (242.904042s) and alignment with rights=needs-review. |
| 9 | visual-plan | approved | 1 | internal-autonomous-review | Imported formal planning SSOT with 14 scene(s), 4 graph(s), and 46 shot(s). |
| 10 | diagram-assets | approved | 1 | machine | Computed ELK layouts for 4 canonical planning graph(s). |
| 11 | style-probe | approved | 1 | internal-autonomous-review | Imported the hash-bound 3.16s style probe for internal review. |
| 12 | composition-readiness | approved | 1 | machine | Technical checks passed for internal-only composition; public release remains blocked. |
| 13 | full-production | approved | 2 | machine | Compiled 14 scenes and 46 locked cues into a 242.904042s HyperFrames composition. |
| 14 | qa-review | approved | 2 | machine | HyperFrames strict check passed. Final MP4 media QA remains after render. |
| 15 | final-preview | approved | 2 | internal-autonomous-review | Prepared the final Studio preview request. Open it and approve only after watching the full timeline. |
| 16 | render-deliver | approved | 2 | machine | Rendered and decoded an internal-review MP4; public release remains blocked. |
| 17 | delivery-qa | approved | 3 | machine | Delivery master passed media QA; generated cover, 4 review frames and the delivery manifest inputs. Retrospective finalizes the complete SHA-256 manifest. |
| 18 | retrospective | approved | 3 | internal-autonomous-review | Created the UTF-8 retrospective, finalized the delivery manifest, and synchronized SOP status. |
| 19 | package-export | approved | 1 | machine | Assembled and verified the 329-file standard delivery package (internal-only; public release blocked=true). |
