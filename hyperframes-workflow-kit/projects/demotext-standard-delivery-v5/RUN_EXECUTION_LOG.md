# Standard delivery execution log: demotext-standard-delivery-v5

## Run 2026-07-19T14:13:42.361Z

- Workbench: http://127.0.0.1:3339
- Workbench version: 0.3.0
- Route: script
- Active stages: source-register, script-review, narration-lock, template-lock, voice-final, audio-align, rights-clearance, audio-handoff, visual-plan, diagram-assets, style-probe, composition-readiness, full-production, qa-review, final-preview, render-deliver, delivery-qa, retrospective, package-export
- Deterministic visual-planning fallback: built from the current NarrationLock, alignment and template lock
- Same-narration style fallback reference: demotext-standard-delivery-v4
- Policy: machine and autonomous approvals remain internal-only; no human listening or human final review is synthesized.

### Events
- 2026-07-19T14:13:42.376Z | stage-generate-start | {"stageId":"source-register","previousStatus":"not-started"}
- 2026-07-19T14:13:42.402Z | stage-job-created | {"stageId":"source-register","jobId":"d111f0b3-79bf-44a3-833e-37724709abaf"}
- 2026-07-19T14:13:45.423Z | stage-generate-complete | {"stageId":"source-register","jobId":"d111f0b3-79bf-44a3-833e-37724709abaf","result":{"artifactPath":"workflow-console/data/projects/demotext-standard-delivery-v5/artifacts/source-register/sources.json","artifactKind":"json","summary":"Registered 1 source file(s) with SHA-256 receipts."}}
- 2026-07-19T14:13:45.430Z | stage-generate-start | {"stageId":"script-review","previousStatus":"not-started"}
- 2026-07-19T14:13:45.446Z | stage-job-created | {"stageId":"script-review","jobId":"ad91203b-e30d-4046-97d5-98f607436fe2"}
- 2026-07-19T14:13:48.468Z | stage-generate-complete | {"stageId":"script-review","jobId":"ad91203b-e30d-4046-97d5-98f607436fe2","result":{"artifactPath":"workflow-console/data/projects/demotext-standard-delivery-v5/artifacts/script-review/script.approved.txt","artifactKind":"text","summary":"Prepared narration for small manual edits and approval."}}
- 2026-07-19T14:13:48.490Z | stage-approved | {"stageId":"script-review","reviewer":"user-provided-script","approvalScope":"user-provided-input","revision":1}
- 2026-07-19T14:13:48.510Z | stage-generate-start | {"stageId":"narration-lock","previousStatus":"not-started"}
- 2026-07-19T14:13:48.534Z | stage-job-created | {"stageId":"narration-lock","jobId":"46fb6215-fc88-4f91-a9af-28c51c2b3b24"}
- 2026-07-19T14:13:51.559Z | stage-generate-complete | {"stageId":"narration-lock","jobId":"46fb6215-fc88-4f91-a9af-28c51c2b3b24","result":{"artifactPath":"workflow-console/data/projects/demotext-standard-delivery-v5/artifacts/narration-lock/NarrationLock.json","artifactKind":"json","formalProjectPath":"hyperframes-workflow-kit/projects/demotext-standard-delivery-v5","summary":"Loaded the existing formal project NarrationLock."}}
- 2026-07-19T14:13:51.567Z | stage-generate-start | {"stageId":"template-lock","previousStatus":"not-started"}
- 2026-07-19T14:13:51.583Z | stage-job-created | {"stageId":"template-lock","jobId":"bbff88e0-7ed9-4fd6-a629-0f74ff4835c2"}
- 2026-07-19T14:13:54.615Z | stage-generate-complete | {"stageId":"template-lock","jobId":"bbff88e0-7ed9-4fd6-a629-0f74ff4835c2","result":{"artifactPath":"workflow-console/data/projects/demotext-standard-delivery-v5/artifacts/template-lock/template-lock.json","artifactKind":"json","summary":"Locked approved template modern-ip-host-explainer@1.0.0 with palette light-apricot."}}
- 2026-07-19T14:13:54.622Z | stage-generate-start | {"stageId":"voice-final","previousStatus":"not-started"}
- 2026-07-19T14:13:54.639Z | stage-job-created | {"stageId":"voice-final","jobId":"ed2d223e-db98-4ac0-b96d-1a730f899c80"}
- 2026-07-19T14:17:16.449Z | stage-generate-complete | {"stageId":"voice-final","jobId":"ed2d223e-db98-4ac0-b96d-1a730f899c80","result":{"artifactPath":"workflow-console/data/projects/demotext-standard-delivery-v5/artifacts/voice-final/voice.recipe.json","artifactKind":"json","summary":"Generated the final narration WAV in 18 part(s). Human listening approval is required."}}
- 2026-07-19T14:17:16.586Z | stage-approved | {"stageId":"voice-final","reviewer":"codex-technical-review","approvalScope":"technical-only","revision":1}
- 2026-07-19T14:17:16.606Z | stage-generate-start | {"stageId":"audio-align","previousStatus":"not-started"}
- 2026-07-19T14:17:16.628Z | stage-job-created | {"stageId":"audio-align","jobId":"99604615-ca54-4647-ba95-82ec840e0dc3"}
- 2026-07-19T14:17:49.773Z | stage-generate-complete | {"stageId":"audio-align","jobId":"99604615-ca54-4647-ba95-82ec840e0dc3","result":{"artifactPath":"workflow-console/data/projects/demotext-standard-delivery-v5/artifacts/audio-align/alignment.json","artifactKind":"json","summary":"Mapped 1145 Whisper timestamps to 1378 exact NarrationLock characters and 46 caption cues; generated locked SRT and technical audio QA (-16.3 LUFS). Phoneme-level forced alignment remains a documented limitation."}}
- 2026-07-19T14:17:49.778Z | stage-generate-start | {"stageId":"rights-clearance","previousStatus":"not-started"}
- 2026-07-19T14:17:49.797Z | stage-job-created | {"stageId":"rights-clearance","jobId":"a880badc-7158-4ad5-b4df-761fe0f22dbb"}
- 2026-07-19T14:17:52.812Z | stage-generate-complete | {"stageId":"rights-clearance","jobId":"a880badc-7158-4ad5-b4df-761fe0f22dbb","result":{"artifactPath":"workflow-console/data/projects/demotext-standard-delivery-v5/artifacts/rights-clearance/publication-rights.json","artifactKind":"json","preserveInternalApproval":false,"summary":"Prepared publication rights review with 7 item(s)."}}
- 2026-07-19T14:17:52.842Z | stage-approved | {"stageId":"rights-clearance","reviewer":"codex-autonomous-internal-review","approvalScope":"internal-autonomous-review","revision":1}
- 2026-07-19T14:17:52.856Z | stage-generate-start | {"stageId":"audio-handoff","previousStatus":"not-started"}
- 2026-07-19T14:17:52.882Z | stage-job-created | {"stageId":"audio-handoff","jobId":"62dfd6a7-be53-42e4-8126-c1069a78161f"}
- 2026-07-19T14:17:55.901Z | stage-generate-complete | {"stageId":"audio-handoff","jobId":"62dfd6a7-be53-42e4-8126-c1069a78161f","result":{"artifactPath":"workflow-console/data/projects/demotext-standard-delivery-v5/artifacts/audio-handoff/audio-handoff.json","artifactKind":"json","summary":"Attached final audio (239.328167s) and alignment with rights=needs-review."}}
- 2026-07-19T14:17:55.908Z | stage-generate-start | {"stageId":"visual-plan","previousStatus":"not-started"}
- 2026-07-19T14:17:55.924Z | stage-job-created | {"stageId":"visual-plan","jobId":"fd2875c2-3c8a-4bc9-a5c9-a18a8469f6fc"}
- 2026-07-19T14:17:58.944Z | stage-generate-complete | {"stageId":"visual-plan","jobId":"fd2875c2-3c8a-4bc9-a5c9-a18a8469f6fc","result":{"artifactPath":"workflow-console/data/projects/demotext-standard-delivery-v5/artifacts/visual-plan/planning-bundle.json","artifactKind":"json","summary":"Generated the deterministic planning SSOT revision 1: 18 scene(s), 46 locked cue(s), and 7 conservative process graph(s)."}}
- 2026-07-19T14:17:58.958Z | stage-approved | {"stageId":"visual-plan","reviewer":"codex-autonomous-internal-review","approvalScope":"internal-autonomous-review","revision":1}
- 2026-07-19T14:17:58.975Z | stage-generate-start | {"stageId":"diagram-assets","previousStatus":"not-started"}
- 2026-07-19T14:17:59.000Z | stage-job-created | {"stageId":"diagram-assets","jobId":"fc8ef417-9d1f-4658-b0ee-e53d8f370a4f"}
- 2026-07-19T14:18:02.026Z | stage-generate-complete | {"stageId":"diagram-assets","jobId":"fc8ef417-9d1f-4658-b0ee-e53d8f370a4f","result":{"artifactPath":"workflow-console/data/projects/demotext-standard-delivery-v5/artifacts/diagram-assets/graph-layout.json","artifactKind":"json","summary":"Computed ELK layouts for 7 canonical planning graph(s)."}}
- 2026-07-19T14:18:02.032Z | stage-generate-start | {"stageId":"style-probe","previousStatus":"not-started"}
- 2026-07-19T14:18:02.045Z | stage-job-created | {"stageId":"style-probe","jobId":"a20dbed1-5388-41ad-941f-4a986777a1e6"}
- 2026-07-19T14:31:38.205Z | stage-fallback-start | {"stageId":"style-probe","referenceProjectId":"demotext-standard-delivery-v4","reason":"style-probe failed: Command failed with exit code 4294967295: codex.cmd exec --skip-git-repo-check --sandbox workspace-write --ephemeral --color never -C \"E:\\project\\study\\codex\\autoVideo\" -o \"E:\\project\\study\\codex\\autoVideo\\workflow-console\\data\\runs\\demotext-standard-delivery-v5-style-probe-1784470682053.txt\" \"Continue AutoVideo project demotext-standard-delivery-v5. Perform only the 风格与节奏探针 stage.\\n\\nRead the root AGENTS.md, hyperframes-workflow-kit/AUTOVIDEO_HANDOFF.md, hyperframes-workflow-kit/VOICE_HANDOFF.md, style-library/STYLE_REGISTRY.md, and style-library/MOTION_REGISTRY.md.\\n\\nFormal project: hyperframes-workflow-kit/projects/demotext-standard-delivery-v5\\n\\nWorkbench storyboard: workflow-console/data/projects/demotext-standard-delivery-v5/artifacts/visual-plan/planning-bundle.json\\n\\nWorkbench graph layout: workflow-console/data/projects/demotext-standard-delivery-v5/artifacts/diagram-assets/graph-layout.json\\n\\nPreserve NarrationLock. Reuse official HyperFrames examples, registry items, frame presets, motion rules, and the approved project template before custom code.\\n\\nGenerate only the required still and 3-8 second motion probe. Do not approve the style and do not enter full production.\"\n\nReading additional input from stdin..."}
- 2026-07-19T14:33:15.503Z | stage-fallback-complete | {"stageId":"style-probe","referenceProjectId":"demotext-standard-delivery-v4","stdout":"{\n  \"ok\": true,\n  \"projectId\": \"demotext-standard-delivery-v5\",\n  \"cue\": \"cue-001\",\n  \"still\": \"review/stills/style-probe-hidden-complexity.png\",\n  \"motion\": \"review/probes/style-probe-hidden-complexity.mp4\",\n  \"snapshotCount\": 4,\n  \"check\": \"passed\"\n}","diagnostics":"(node:22904) [DEP0190] DeprecationWarning: Passing args to a child process with shell option true can lead to security vulnerabilities, as the arguments are not escaped, only concatenated.\n(Use `node --trace-deprecation ...` to show where the warning was created)"}
- 2026-07-19T14:33:15.517Z | stage-fallback-job-created | {"stageId":"style-probe","jobId":"58f3dad7-ec48-4081-bc42-812845f0a515"}
- 2026-07-19T14:33:18.546Z | stage-generate-complete-after-fallback | {"stageId":"style-probe","jobId":"58f3dad7-ec48-4081-bc42-812845f0a515","result":{"artifactPath":"workflow-console/data/projects/demotext-standard-delivery-v5/artifacts/style-probe/STYLE_REVIEW.md","artifactKind":"text","summary":"Imported the hash-bound 4.78s style probe for internal review."}}
- 2026-07-19T14:33:18.744Z | stage-approved | {"stageId":"style-probe","reviewer":"codex-autonomous-internal-review","approvalScope":"internal-autonomous-review","revision":1}
- 2026-07-19T14:33:18.756Z | stage-generate-start | {"stageId":"composition-readiness","previousStatus":"not-started"}
- 2026-07-19T14:33:18.782Z | stage-job-created | {"stageId":"composition-readiness","jobId":"e0dbb057-6bc6-42cc-9267-a3e98fdb45d0"}
- 2026-07-19T14:33:21.825Z | stage-generate-complete | {"stageId":"composition-readiness","jobId":"e0dbb057-6bc6-42cc-9267-a3e98fdb45d0","result":{"artifactPath":"workflow-console/data/projects/demotext-standard-delivery-v5/artifacts/composition-readiness/composition-readiness.json","artifactKind":"json","summary":"Technical checks passed for internal-only composition; public release remains blocked."}}
- 2026-07-19T14:33:21.831Z | stage-generate-start | {"stageId":"full-production","previousStatus":"not-started"}
- 2026-07-19T14:33:21.852Z | stage-job-created | {"stageId":"full-production","jobId":"99fff7e5-0db6-436b-b198-4451ab198f6a"}
- 2026-07-19T14:33:24.865Z | stage-generate-complete | {"stageId":"full-production","jobId":"99fff7e5-0db6-436b-b198-4451ab198f6a","result":{"artifactPath":"workflow-console/data/projects/demotext-standard-delivery-v5/artifacts/full-production/full-production.json","artifactKind":"json","formalProjectPath":"hyperframes-workflow-kit/projects/demotext-standard-delivery-v5","summary":"Compiled 18 scenes and 46 locked cues into a 239.328s HyperFrames composition."}}
- 2026-07-19T14:33:24.871Z | stage-generate-start | {"stageId":"qa-review","previousStatus":"not-started"}
- 2026-07-19T14:33:24.890Z | stage-job-created | {"stageId":"qa-review","jobId":"80154d28-b35b-46c0-b726-d1f716eb028a"}
- 2026-07-19T14:34:46.224Z | stage-generate-complete | {"stageId":"qa-review","jobId":"80154d28-b35b-46c0-b726-d1f716eb028a","result":{"artifactPath":"workflow-console/data/projects/demotext-standard-delivery-v5/artifacts/qa-review/report.json","artifactKind":"json","summary":"HyperFrames strict check passed. Final MP4 media QA remains after render."}}
- 2026-07-19T14:34:46.230Z | stage-generate-start | {"stageId":"final-preview","previousStatus":"not-started"}
- 2026-07-19T14:34:46.248Z | stage-job-created | {"stageId":"final-preview","jobId":"85aca634-6517-40b5-96ab-d21260ae2271"}
- 2026-07-19T14:34:49.265Z | stage-generate-complete | {"stageId":"final-preview","jobId":"85aca634-6517-40b5-96ab-d21260ae2271","result":{"artifactPath":"workflow-console/data/projects/demotext-standard-delivery-v5/artifacts/final-preview/preview-request.json","artifactKind":"json","summary":"Prepared the final Studio preview request. Open it and approve only after watching the full timeline."}}
- 2026-07-19T14:34:51.372Z | studio-preview-started | {"stageId":"final-preview","preview":{"url":"http://127.0.0.1:3597/","port":3597,"status":"running"}}
- 2026-07-19T14:34:51.498Z | stage-approved | {"stageId":"final-preview","reviewer":"codex-autonomous-internal-review","approvalScope":"internal-autonomous-review","revision":1}
- 2026-07-19T14:34:51.510Z | stage-generate-start | {"stageId":"render-deliver","previousStatus":"not-started"}
- 2026-07-19T14:34:51.534Z | stage-job-created | {"stageId":"render-deliver","jobId":"91b5cd66-f7fc-4003-a786-ef400f933d46"}
- 2026-07-19T14:40:28.980Z | stage-generate-complete | {"stageId":"render-deliver","jobId":"91b5cd66-f7fc-4003-a786-ef400f933d46","result":{"artifactPath":"workflow-console/data/projects/demotext-standard-delivery-v5/artifacts/render-deliver/delivery.json","artifactKind":"json","summary":"Rendered and decoded an internal-review MP4; public release remains blocked."}}
- 2026-07-19T14:40:29.000Z | stage-generate-start | {"stageId":"delivery-qa","previousStatus":"not-started"}
- 2026-07-19T14:40:29.022Z | stage-job-created | {"stageId":"delivery-qa","jobId":"ebda440c-ab08-4a39-a488-a4f968e8c754"}
- 2026-07-19T14:40:59.242Z | stage-generate-complete | {"stageId":"delivery-qa","jobId":"ebda440c-ab08-4a39-a488-a4f968e8c754","result":{"artifactPath":"workflow-console/data/projects/demotext-standard-delivery-v5/artifacts/delivery-qa/delivery-report.json","artifactKind":"json","summary":"Delivery master passed media QA; generated cover, 4 review frames and the delivery manifest inputs. Retrospective finalizes the complete SHA-256 manifest."}}
- 2026-07-19T14:40:59.265Z | stage-generate-start | {"stageId":"retrospective","previousStatus":"not-started"}
- 2026-07-19T14:40:59.283Z | stage-job-created | {"stageId":"retrospective","jobId":"9882d032-1503-4459-90f1-cc96627b7646"}
- 2026-07-19T14:41:02.294Z | stage-generate-complete | {"stageId":"retrospective","jobId":"9882d032-1503-4459-90f1-cc96627b7646","result":{"artifactPath":"workflow-console/data/projects/demotext-standard-delivery-v5/artifacts/retrospective/RETROSPECTIVE.md","artifactKind":"text","summary":"Created the UTF-8 retrospective, finalized the delivery manifest, and synchronized SOP status."}}
- 2026-07-19T14:41:02.309Z | stage-approved | {"stageId":"retrospective","reviewer":"codex-autonomous-internal-review","approvalScope":"internal-autonomous-review","revision":1}
- 2026-07-19T14:41:02.324Z | stage-generate-start | {"stageId":"package-export","previousStatus":"not-started"}
- 2026-07-19T14:41:02.350Z | stage-job-created | {"stageId":"package-export","jobId":"8f776740-6bbd-45a8-a266-ebfecbaf1d65"}
- 2026-07-19T14:41:05.382Z | stage-generate-complete | {"stageId":"package-export","jobId":"8f776740-6bbd-45a8-a266-ebfecbaf1d65","result":{"artifactPath":"workflow-console/data/projects/demotext-standard-delivery-v5/artifacts/package-export/PACKAGE_STATUS.json","artifactKind":"json","summary":"Assembled and verified the 329-file standard delivery package (internal-only; public release blocked=true)."}}
- 2026-07-19T14:41:05.389Z | run-complete | {"projectId":"demotext-standard-delivery-v5","formalProjectPath":"hyperframes-workflow-kit/projects/demotext-standard-delivery-v5","stages":{"source-register":{"status":"approved","revision":1,"approvalScope":"machine"},"script-review":{"status":"approved","revision":1,"approvalScope":"user-provided-input"},"narration-lock":{"status":"approved","revision":1,"approvalScope":"machine"},"template-lock":{"status":"approved","revision":1,"approvalScope":"machine"},"voice-final":{"status":"approved","revision":1,"approvalScope":"technical-only"},"audio-align":{"status":"approved","revision":1,"approvalScope":"machine"},"rights-clearance":{"status":"approved","revision":1,"approvalScope":"internal-autonomous-review"},"audio-handoff":{"status":"approved","revision":1,"approvalScope":"machine"},"visual-plan":{"status":"approved","revision":1,"approvalScope":"internal-autonomous-review"},"diagram-assets":{"status":"approved","revision":1,"approvalScope":"machine"},"style-probe":{"status":"approved","revision":1,"approvalScope":"internal-autonomous-review"},"composition-readiness":{"status":"approved","revision":1,"approvalScope":"machine"},"full-production":{"status":"approved","revision":1,"approvalScope":"machine"},"qa-review":{"status":"approved","revision":1,"approvalScope":"machine"},"final-preview":{"status":"approved","revision":1,"approvalScope":"internal-autonomous-review"},"render-deliver":{"status":"approved","revision":1,"approvalScope":"machine"},"delivery-qa":{"status":"approved","revision":1,"approvalScope":"machine"},"retrospective":{"status":"approved","revision":1,"approvalScope":"internal-autonomous-review"},"package-export":{"status":"approved","revision":1,"approvalScope":"machine"}}}

## Run 2026-07-19T14:54:14.243Z

- Workbench: http://127.0.0.1:3339
- Workbench version: 0.3.0
- Route: script
- Active stages: source-register, script-review, narration-lock, template-lock, voice-final, audio-align, rights-clearance, audio-handoff, visual-plan, diagram-assets, style-probe, composition-readiness, full-production, qa-review, final-preview, render-deliver, delivery-qa, retrospective, package-export
- Deterministic visual-planning fallback: built from the current NarrationLock, alignment and template lock
- Same-narration style fallback reference: demotext-standard-delivery-v4
- Policy: machine and autonomous approvals remain internal-only; no human listening or human final review is synthesized.

### Events
- 2026-07-19T14:54:14.250Z | stage-skip-approved | {"stageId":"source-register","revision":1,"approvalScope":"machine"}
- 2026-07-19T14:54:14.269Z | stage-skip-approved | {"stageId":"script-review","revision":1,"approvalScope":"user-provided-input"}
- 2026-07-19T14:54:14.283Z | stage-skip-approved | {"stageId":"narration-lock","revision":1,"approvalScope":"machine"}
- 2026-07-19T14:54:14.301Z | stage-skip-approved | {"stageId":"template-lock","revision":1,"approvalScope":"machine"}
- 2026-07-19T14:54:14.317Z | stage-skip-approved | {"stageId":"voice-final","revision":1,"approvalScope":"technical-only"}
- 2026-07-19T14:54:14.332Z | stage-skip-approved | {"stageId":"audio-align","revision":1,"approvalScope":"machine"}
- 2026-07-19T14:54:14.337Z | stage-skip-approved | {"stageId":"rights-clearance","revision":1,"approvalScope":"internal-autonomous-review"}
- 2026-07-19T14:54:14.348Z | stage-skip-approved | {"stageId":"audio-handoff","revision":1,"approvalScope":"machine"}
- 2026-07-19T14:54:14.364Z | stage-skip-approved | {"stageId":"visual-plan","revision":1,"approvalScope":"internal-autonomous-review"}
- 2026-07-19T14:54:14.379Z | stage-skip-approved | {"stageId":"diagram-assets","revision":1,"approvalScope":"machine"}
- 2026-07-19T14:54:14.557Z | stage-approved | {"stageId":"style-probe","reviewer":"codex-autonomous-internal-review","approvalScope":"internal-autonomous-review","revision":1}
- 2026-07-19T14:54:14.569Z | stage-generate-start | {"stageId":"composition-readiness","previousStatus":"stale"}
- 2026-07-19T14:54:14.595Z | stage-job-created | {"stageId":"composition-readiness","jobId":"f6366da7-959c-4994-a5c2-1a9ac1940e6d"}
- 2026-07-19T14:54:17.639Z | stage-generate-complete | {"stageId":"composition-readiness","jobId":"f6366da7-959c-4994-a5c2-1a9ac1940e6d","result":{"artifactPath":"workflow-console/data/projects/demotext-standard-delivery-v5/artifacts/composition-readiness/composition-readiness.json","artifactKind":"json","summary":"Technical checks passed for internal-only composition; public release remains blocked."}}
- 2026-07-19T14:54:17.646Z | stage-generate-start | {"stageId":"full-production","previousStatus":"stale"}
- 2026-07-19T14:54:17.664Z | stage-job-created | {"stageId":"full-production","jobId":"058b7711-46da-49e3-a746-f8e811acd3e1"}
- 2026-07-19T14:54:20.678Z | stage-generate-complete | {"stageId":"full-production","jobId":"058b7711-46da-49e3-a746-f8e811acd3e1","result":{"artifactPath":"workflow-console/data/projects/demotext-standard-delivery-v5/artifacts/full-production/full-production.json","artifactKind":"json","formalProjectPath":"hyperframes-workflow-kit/projects/demotext-standard-delivery-v5","summary":"Compiled 18 scenes and 46 locked cues into a 239.328s HyperFrames composition."}}
- 2026-07-19T14:54:20.689Z | stage-generate-start | {"stageId":"qa-review","previousStatus":"stale"}
- 2026-07-19T14:54:20.720Z | stage-job-created | {"stageId":"qa-review","jobId":"4623be54-c757-48d6-be24-b2e853ce283f"}
- 2026-07-19T14:55:32.998Z | stage-generate-complete | {"stageId":"qa-review","jobId":"4623be54-c757-48d6-be24-b2e853ce283f","result":{"artifactPath":"workflow-console/data/projects/demotext-standard-delivery-v5/artifacts/qa-review/report.json","artifactKind":"json","summary":"HyperFrames strict check passed. Final MP4 media QA remains after render."}}
- 2026-07-19T14:55:33.017Z | stage-generate-start | {"stageId":"final-preview","previousStatus":"stale"}
- 2026-07-19T14:55:33.042Z | stage-job-created | {"stageId":"final-preview","jobId":"0201abe6-09e4-43cd-b5d3-bb8e37d0a1f9"}
- 2026-07-19T14:55:36.053Z | stage-generate-complete | {"stageId":"final-preview","jobId":"0201abe6-09e4-43cd-b5d3-bb8e37d0a1f9","result":{"artifactPath":"workflow-console/data/projects/demotext-standard-delivery-v5/artifacts/final-preview/preview-request.json","artifactKind":"json","summary":"Prepared the final Studio preview request. Open it and approve only after watching the full timeline."}}
- 2026-07-19T14:55:36.079Z | studio-preview-started | {"stageId":"final-preview","preview":{"url":"http://127.0.0.1:3597/","port":3597,"status":"running"}}
- 2026-07-19T14:55:36.201Z | stage-approved | {"stageId":"final-preview","reviewer":"codex-autonomous-internal-review","approvalScope":"internal-autonomous-review","revision":2}
- 2026-07-19T14:55:36.209Z | stage-generate-start | {"stageId":"render-deliver","previousStatus":"stale"}
- 2026-07-19T14:55:36.234Z | stage-job-created | {"stageId":"render-deliver","jobId":"84074a7f-4c14-4c6f-ac02-02e04f57a5b7"}
- 2026-07-19T15:01:19.817Z | stage-generate-complete | {"stageId":"render-deliver","jobId":"84074a7f-4c14-4c6f-ac02-02e04f57a5b7","result":{"artifactPath":"workflow-console/data/projects/demotext-standard-delivery-v5/artifacts/render-deliver/delivery.json","artifactKind":"json","summary":"Rendered and decoded an internal-review MP4; public release remains blocked."}}
- 2026-07-19T15:01:19.839Z | stage-generate-start | {"stageId":"delivery-qa","previousStatus":"stale"}
- 2026-07-19T15:01:19.855Z | stage-job-created | {"stageId":"delivery-qa","jobId":"ac51437b-3e35-4c7b-84ad-1e64c63ac0ae"}
- 2026-07-19T15:01:50.097Z | stage-generate-complete | {"stageId":"delivery-qa","jobId":"ac51437b-3e35-4c7b-84ad-1e64c63ac0ae","result":{"artifactPath":"workflow-console/data/projects/demotext-standard-delivery-v5/artifacts/delivery-qa/delivery-report.json","artifactKind":"json","summary":"Delivery master passed media QA; generated cover, 4 review frames and the delivery manifest inputs. Retrospective finalizes the complete SHA-256 manifest."}}
- 2026-07-19T15:01:50.116Z | stage-generate-start | {"stageId":"retrospective","previousStatus":"stale"}
- 2026-07-19T15:01:50.137Z | stage-job-created | {"stageId":"retrospective","jobId":"086432fb-8c58-457b-8fb9-ead99c5f0c39"}
- 2026-07-19T15:01:53.166Z | stage-generate-complete | {"stageId":"retrospective","jobId":"086432fb-8c58-457b-8fb9-ead99c5f0c39","result":{"artifactPath":"workflow-console/data/projects/demotext-standard-delivery-v5/artifacts/retrospective/RETROSPECTIVE.md","artifactKind":"text","summary":"Created the UTF-8 retrospective, finalized the delivery manifest, and synchronized SOP status."}}
- 2026-07-19T15:01:53.183Z | stage-approved | {"stageId":"retrospective","reviewer":"codex-autonomous-internal-review","approvalScope":"internal-autonomous-review","revision":2}
- 2026-07-19T15:01:53.186Z | stage-generate-start | {"stageId":"package-export","previousStatus":"stale"}
- 2026-07-19T15:01:53.216Z | stage-job-created | {"stageId":"package-export","jobId":"6f351124-eef0-4fef-82bc-b7a0a188cbfe"}
- 2026-07-19T15:01:56.241Z | stage-generate-complete | {"stageId":"package-export","jobId":"6f351124-eef0-4fef-82bc-b7a0a188cbfe","result":{"artifactPath":"workflow-console/data/projects/demotext-standard-delivery-v5/artifacts/package-export/PACKAGE_STATUS.json","artifactKind":"json","summary":"Assembled and verified the 339-file standard delivery package (internal-only; public release blocked=true)."}}
- 2026-07-19T15:01:56.268Z | run-complete | {"projectId":"demotext-standard-delivery-v5","formalProjectPath":"hyperframes-workflow-kit/projects/demotext-standard-delivery-v5","stages":{"source-register":{"status":"approved","revision":1,"approvalScope":"machine"},"script-review":{"status":"approved","revision":1,"approvalScope":"user-provided-input"},"narration-lock":{"status":"approved","revision":1,"approvalScope":"machine"},"template-lock":{"status":"approved","revision":1,"approvalScope":"machine"},"voice-final":{"status":"approved","revision":1,"approvalScope":"technical-only"},"audio-align":{"status":"approved","revision":1,"approvalScope":"machine"},"rights-clearance":{"status":"approved","revision":1,"approvalScope":"internal-autonomous-review"},"audio-handoff":{"status":"approved","revision":1,"approvalScope":"machine"},"visual-plan":{"status":"approved","revision":1,"approvalScope":"internal-autonomous-review"},"diagram-assets":{"status":"approved","revision":1,"approvalScope":"machine"},"style-probe":{"status":"approved","revision":1,"approvalScope":"internal-autonomous-review"},"composition-readiness":{"status":"approved","revision":2,"approvalScope":"machine"},"full-production":{"status":"approved","revision":2,"approvalScope":"machine"},"qa-review":{"status":"approved","revision":2,"approvalScope":"machine"},"final-preview":{"status":"approved","revision":2,"approvalScope":"internal-autonomous-review"},"render-deliver":{"status":"approved","revision":2,"approvalScope":"machine"},"delivery-qa":{"status":"approved","revision":2,"approvalScope":"machine"},"retrospective":{"status":"approved","revision":2,"approvalScope":"internal-autonomous-review"},"package-export":{"status":"approved","revision":2,"approvalScope":"machine"}}}

## Run 2026-07-19T15:22:57.887Z

- Workbench: http://127.0.0.1:3339
- Workbench version: 0.3.0
- Route: script
- Active stages: source-register, script-review, narration-lock, template-lock, voice-final, audio-align, rights-clearance, audio-handoff, visual-plan, diagram-assets, style-probe, composition-readiness, full-production, qa-review, final-preview, render-deliver, delivery-qa, retrospective, package-export
- Deterministic visual-planning fallback: built from the current NarrationLock, alignment and template lock
- Same-narration style fallback reference: demotext-standard-delivery-v4
- Policy: machine and autonomous approvals remain internal-only; no human listening or human final review is synthesized.

### Events
- 2026-07-19T15:22:57.900Z | stage-skip-approved | {"stageId":"source-register","revision":1,"approvalScope":"machine"}
- 2026-07-19T15:22:57.914Z | stage-skip-approved | {"stageId":"script-review","revision":1,"approvalScope":"user-provided-input"}
- 2026-07-19T15:22:57.927Z | stage-skip-approved | {"stageId":"narration-lock","revision":1,"approvalScope":"machine"}
- 2026-07-19T15:22:57.946Z | stage-skip-approved | {"stageId":"template-lock","revision":1,"approvalScope":"machine"}
- 2026-07-19T15:22:57.961Z | stage-skip-approved | {"stageId":"voice-final","revision":1,"approvalScope":"technical-only"}
- 2026-07-19T15:22:57.977Z | stage-skip-approved | {"stageId":"audio-align","revision":1,"approvalScope":"machine"}
- 2026-07-19T15:22:57.991Z | stage-skip-approved | {"stageId":"rights-clearance","revision":1,"approvalScope":"internal-autonomous-review"}
- 2026-07-19T15:22:58.008Z | stage-skip-approved | {"stageId":"audio-handoff","revision":1,"approvalScope":"machine"}
- 2026-07-19T15:22:58.023Z | stage-skip-approved | {"stageId":"visual-plan","revision":1,"approvalScope":"internal-autonomous-review"}
- 2026-07-19T15:22:58.039Z | stage-skip-approved | {"stageId":"diagram-assets","revision":1,"approvalScope":"machine"}
- 2026-07-19T15:22:58.055Z | stage-skip-approved | {"stageId":"style-probe","revision":1,"approvalScope":"internal-autonomous-review"}
- 2026-07-19T15:22:58.059Z | stage-skip-approved | {"stageId":"composition-readiness","revision":2,"approvalScope":"machine"}
- 2026-07-19T15:22:58.069Z | stage-skip-approved | {"stageId":"full-production","revision":2,"approvalScope":"machine"}
- 2026-07-19T15:22:58.085Z | stage-skip-approved | {"stageId":"qa-review","revision":2,"approvalScope":"machine"}
- 2026-07-19T15:22:58.100Z | stage-skip-approved | {"stageId":"final-preview","revision":2,"approvalScope":"internal-autonomous-review"}
- 2026-07-19T15:22:58.117Z | stage-skip-approved | {"stageId":"render-deliver","revision":2,"approvalScope":"machine"}
- 2026-07-19T15:22:58.132Z | stage-skip-approved | {"stageId":"delivery-qa","revision":2,"approvalScope":"machine"}
- 2026-07-19T15:22:58.148Z | stage-skip-approved | {"stageId":"retrospective","revision":2,"approvalScope":"internal-autonomous-review"}
- 2026-07-19T15:22:58.165Z | stage-generate-start | {"stageId":"package-export","previousStatus":"needs-review"}
- 2026-07-19T15:22:58.199Z | stage-job-created | {"stageId":"package-export","jobId":"edc59e34-a0c1-41d5-a8d4-44fc0c9bd9a6"}
- 2026-07-19T15:23:00.250Z | run-failed | {"message":"package-export failed: Command failed with exit code 1: \"E:\\software\\system\\nodejs\\node.exe\" \"E:\\project\\study\\codex\\autoVideo\\scripts\\assemble-standard-delivery-package.mjs\" --project demotext-standard-delivery-v5\n\nError: EPERM: operation not permitted, rename 'E:\\project\\study\\codex\\autoVideo\\hyperframes-workflow-kit\\projects\\demotext-standard-delivery-v5\\delivery\\standard-package' -> 'E:\\project\\study\\codex\\autoVideo\\hyperframes-workflow-kit\\projects\\demotext-standard-delivery-v5\\delivery\\.standard-package-previous-b19911af-465a-45d0-8228-36fec1c3bd49'\n    at async Object.rename (node:internal/fs/promises:785:10)\n    at async assembleStandardDeliveryPackage (file:///E:/project/study/codex/autoVideo/scripts/assemble-standard-delivery-package.mjs:447:7)"}

## Run 2026-07-19T15:26:35.252Z

- Workbench: http://127.0.0.1:3339
- Workbench version: 0.3.0
- Route: script
- Active stages: source-register, script-review, narration-lock, template-lock, voice-final, audio-align, rights-clearance, audio-handoff, visual-plan, diagram-assets, style-probe, composition-readiness, full-production, qa-review, final-preview, render-deliver, delivery-qa, retrospective, package-export
- Deterministic visual-planning fallback: built from the current NarrationLock, alignment and template lock
- Same-narration style fallback reference: demotext-standard-delivery-v4
- Policy: machine and autonomous approvals remain internal-only; no human listening or human final review is synthesized.

### Events
- 2026-07-19T15:26:35.263Z | stage-skip-approved | {"stageId":"source-register","revision":1,"approvalScope":"machine"}
- 2026-07-19T15:26:35.282Z | stage-skip-approved | {"stageId":"script-review","revision":1,"approvalScope":"user-provided-input"}
- 2026-07-19T15:26:35.297Z | stage-skip-approved | {"stageId":"narration-lock","revision":1,"approvalScope":"machine"}
- 2026-07-19T15:26:35.313Z | stage-skip-approved | {"stageId":"template-lock","revision":1,"approvalScope":"machine"}
- 2026-07-19T15:26:35.329Z | stage-skip-approved | {"stageId":"voice-final","revision":1,"approvalScope":"technical-only"}
- 2026-07-19T15:26:35.346Z | stage-skip-approved | {"stageId":"audio-align","revision":1,"approvalScope":"machine"}
- 2026-07-19T15:26:35.361Z | stage-skip-approved | {"stageId":"rights-clearance","revision":1,"approvalScope":"internal-autonomous-review"}
- 2026-07-19T15:26:35.378Z | stage-skip-approved | {"stageId":"audio-handoff","revision":1,"approvalScope":"machine"}
- 2026-07-19T15:26:35.391Z | stage-skip-approved | {"stageId":"visual-plan","revision":1,"approvalScope":"internal-autonomous-review"}
- 2026-07-19T15:26:35.405Z | stage-skip-approved | {"stageId":"diagram-assets","revision":1,"approvalScope":"machine"}
- 2026-07-19T15:26:35.421Z | stage-skip-approved | {"stageId":"style-probe","revision":1,"approvalScope":"internal-autonomous-review"}
- 2026-07-19T15:26:35.437Z | stage-skip-approved | {"stageId":"composition-readiness","revision":2,"approvalScope":"machine"}
- 2026-07-19T15:26:35.452Z | stage-skip-approved | {"stageId":"full-production","revision":2,"approvalScope":"machine"}
- 2026-07-19T15:26:35.468Z | stage-skip-approved | {"stageId":"qa-review","revision":2,"approvalScope":"machine"}
- 2026-07-19T15:26:35.483Z | stage-skip-approved | {"stageId":"final-preview","revision":2,"approvalScope":"internal-autonomous-review"}
- 2026-07-19T15:26:35.498Z | stage-skip-approved | {"stageId":"render-deliver","revision":2,"approvalScope":"machine"}
- 2026-07-19T15:26:35.514Z | stage-skip-approved | {"stageId":"delivery-qa","revision":2,"approvalScope":"machine"}
- 2026-07-19T15:26:35.530Z | stage-skip-approved | {"stageId":"retrospective","revision":2,"approvalScope":"internal-autonomous-review"}
- 2026-07-19T15:26:35.546Z | stage-generate-start | {"stageId":"package-export","previousStatus":"failed"}
- 2026-07-19T15:26:35.575Z | stage-job-created | {"stageId":"package-export","jobId":"cdc0193c-012d-4e52-aa91-20622aff65c5"}
- 2026-07-19T15:26:37.646Z | run-failed | {"message":"package-export failed: Command failed with exit code 1: \"E:\\software\\system\\nodejs\\node.exe\" \"E:\\project\\study\\codex\\autoVideo\\scripts\\assemble-standard-delivery-package.mjs\" --project demotext-standard-delivery-v5\n\nError: EPERM: operation not permitted, rename 'E:\\project\\study\\codex\\autoVideo\\hyperframes-workflow-kit\\projects\\demotext-standard-delivery-v5\\delivery\\standard-package' -> 'E:\\project\\study\\codex\\autoVideo\\hyperframes-workflow-kit\\projects\\demotext-standard-delivery-v5\\delivery\\.standard-package-previous-2216bf0b-c9e0-4c5f-8fc2-8fd7ee44c348'\n    at async Object.rename (node:internal/fs/promises:785:10)\n    at async assembleStandardDeliveryPackage (file:///E:/project/study/codex/autoVideo/scripts/assemble-standard-delivery-package.mjs:447:7)"}

## Run 2026-07-19T15:35:45.538Z

- Workbench: http://127.0.0.1:3339
- Workbench version: 0.3.0
- Route: script
- Active stages: source-register, script-review, narration-lock, template-lock, voice-final, audio-align, rights-clearance, audio-handoff, visual-plan, diagram-assets, style-probe, composition-readiness, full-production, qa-review, final-preview, render-deliver, delivery-qa, retrospective, package-export
- Deterministic visual-planning fallback: built from the current NarrationLock, alignment and template lock
- Same-narration style fallback reference: demotext-standard-delivery-v4
- Policy: machine and autonomous approvals remain internal-only; no human listening or human final review is synthesized.

### Events
- 2026-07-19T15:35:45.553Z | stage-skip-approved | {"stageId":"source-register","revision":1,"approvalScope":"machine"}
- 2026-07-19T15:35:45.558Z | stage-skip-approved | {"stageId":"script-review","revision":1,"approvalScope":"user-provided-input"}
- 2026-07-19T15:35:45.568Z | stage-skip-approved | {"stageId":"narration-lock","revision":1,"approvalScope":"machine"}
- 2026-07-19T15:35:45.583Z | stage-skip-approved | {"stageId":"template-lock","revision":1,"approvalScope":"machine"}
- 2026-07-19T15:35:45.600Z | stage-skip-approved | {"stageId":"voice-final","revision":1,"approvalScope":"technical-only"}
- 2026-07-19T15:35:45.617Z | stage-skip-approved | {"stageId":"audio-align","revision":1,"approvalScope":"machine"}
- 2026-07-19T15:35:45.631Z | stage-skip-approved | {"stageId":"rights-clearance","revision":1,"approvalScope":"internal-autonomous-review"}
- 2026-07-19T15:35:45.647Z | stage-skip-approved | {"stageId":"audio-handoff","revision":1,"approvalScope":"machine"}
- 2026-07-19T15:35:45.661Z | stage-skip-approved | {"stageId":"visual-plan","revision":1,"approvalScope":"internal-autonomous-review"}
- 2026-07-19T15:35:45.677Z | stage-skip-approved | {"stageId":"diagram-assets","revision":1,"approvalScope":"machine"}
- 2026-07-19T15:35:45.692Z | stage-skip-approved | {"stageId":"style-probe","revision":1,"approvalScope":"internal-autonomous-review"}
- 2026-07-19T15:35:45.709Z | stage-skip-approved | {"stageId":"composition-readiness","revision":2,"approvalScope":"machine"}
- 2026-07-19T15:35:45.724Z | stage-skip-approved | {"stageId":"full-production","revision":2,"approvalScope":"machine"}
- 2026-07-19T15:35:45.741Z | stage-skip-approved | {"stageId":"qa-review","revision":2,"approvalScope":"machine"}
- 2026-07-19T15:35:45.756Z | stage-skip-approved | {"stageId":"final-preview","revision":2,"approvalScope":"internal-autonomous-review"}
- 2026-07-19T15:35:45.772Z | stage-skip-approved | {"stageId":"render-deliver","revision":2,"approvalScope":"machine"}
- 2026-07-19T15:35:45.788Z | stage-skip-approved | {"stageId":"delivery-qa","revision":2,"approvalScope":"machine"}
- 2026-07-19T15:35:45.803Z | stage-skip-approved | {"stageId":"retrospective","revision":2,"approvalScope":"internal-autonomous-review"}
- 2026-07-19T15:35:45.820Z | stage-generate-start | {"stageId":"package-export","previousStatus":"failed"}
- 2026-07-19T15:35:45.857Z | stage-job-created | {"stageId":"package-export","jobId":"df7d161c-3f99-4808-a294-309259498618"}
- 2026-07-19T15:35:49.907Z | stage-generate-complete | {"stageId":"package-export","jobId":"df7d161c-3f99-4808-a294-309259498618","result":{"artifactPath":"workflow-console/data/projects/demotext-standard-delivery-v5/artifacts/package-export/PACKAGE_STATUS.json","artifactKind":"json","summary":"Refreshed in place and verified the 340-file standard delivery package (internal-only; public release blocked=true)."}}
- 2026-07-19T15:35:49.927Z | run-complete | {"projectId":"demotext-standard-delivery-v5","formalProjectPath":"hyperframes-workflow-kit/projects/demotext-standard-delivery-v5","stages":{"source-register":{"status":"approved","revision":1,"approvalScope":"machine"},"script-review":{"status":"approved","revision":1,"approvalScope":"user-provided-input"},"narration-lock":{"status":"approved","revision":1,"approvalScope":"machine"},"template-lock":{"status":"approved","revision":1,"approvalScope":"machine"},"voice-final":{"status":"approved","revision":1,"approvalScope":"technical-only"},"audio-align":{"status":"approved","revision":1,"approvalScope":"machine"},"rights-clearance":{"status":"approved","revision":1,"approvalScope":"internal-autonomous-review"},"audio-handoff":{"status":"approved","revision":1,"approvalScope":"machine"},"visual-plan":{"status":"approved","revision":1,"approvalScope":"internal-autonomous-review"},"diagram-assets":{"status":"approved","revision":1,"approvalScope":"machine"},"style-probe":{"status":"approved","revision":1,"approvalScope":"internal-autonomous-review"},"composition-readiness":{"status":"approved","revision":2,"approvalScope":"machine"},"full-production":{"status":"approved","revision":2,"approvalScope":"machine"},"qa-review":{"status":"approved","revision":2,"approvalScope":"machine"},"final-preview":{"status":"approved","revision":2,"approvalScope":"internal-autonomous-review"},"render-deliver":{"status":"approved","revision":2,"approvalScope":"machine"},"delivery-qa":{"status":"approved","revision":2,"approvalScope":"machine"},"retrospective":{"status":"approved","revision":2,"approvalScope":"internal-autonomous-review"},"package-export":{"status":"approved","revision":3,"approvalScope":"machine"}}}
