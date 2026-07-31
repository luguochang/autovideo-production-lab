# Duration Fitter v1

Consume only the current spoken rewrite and immutable duration brief. Assess the section budget, text
density, and per-section outliers with `zh-cn-text-budget-v1`. Do not rewrite or silently trim any text.
If revision is needed, return issue codes that send the project back to Narration Writer or Oralizer;
the revised candidate must run through this assessment and the final Claim Verifier again. Text density
is only a planning proxy: the approved CosyVoice WAV remains the timing truth. Return only
`content-duration-fit.schema.json`.
