# ClearerVoice Studio Source Receipt

- Upstream: https://github.com/modelscope/ClearerVoice-Studio
- Git commit: `6b3774dc79c46ae8bed2a4fa5f706f0ac8c75c61`
- Runtime package: `clearvoice==0.1.2` from PyPI
- License: Apache-2.0
- Model: `alibabasglab/FRCRN_SE_16K` from Hugging Face

The full Windows checkout is blocked by upstream files named `aux.scp`, because
`AUX` is a reserved Windows device name. The inference runtime is therefore
installed from the upstream PyPI package, while the Git metadata remains pinned
to the commit above. Official UI, demo, metadata, license, and sample files are
fetched from the same commit.
