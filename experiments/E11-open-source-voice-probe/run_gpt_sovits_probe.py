import os
from pathlib import Path

os.environ["version"] = "v2"
os.environ["is_half"] = "False"
os.environ["GPT_SOVITS_USE_G2PW"] = "false"

from scipy.io import wavfile

from GPT_SoVITS.inference_webui import (
    change_gpt_weights,
    change_sovits_weights,
    get_tts_wav,
    i18n,
)


ROOT = Path(__file__).resolve().parents[2]
LAB = ROOT / "tools" / "voice-lab" / "GPT-SoVITS"
OUT = Path(__file__).resolve().parent / "output"
OUT.mkdir(parents=True, exist_ok=True)

change_gpt_weights(
    gpt_path=str(LAB / "GPT_SoVITS/pretrained_models/gsv-v2final-pretrained/s1bert25hz-5kh-longer-epoch=12-step=369668.ckpt")
)
change_sovits_weights(
    sovits_path=str(LAB / "GPT_SoVITS/pretrained_models/gsv-v2final-pretrained/s2G2333k.pth")
)

ref_text = (Path(__file__).parent / "ref-text.txt").read_text(encoding="utf-8").strip()
target_name = os.environ.get("GPT_SOVITS_TARGET", "target-text.txt")
target_text = (Path(__file__).parent / target_name).read_text(encoding="utf-8").strip()
ref_audio = Path(__file__).parent / "reference.wav"

language = i18n("中文")
chunks = list(
    get_tts_wav(
        ref_wav_path=str(ref_audio),
        prompt_text=ref_text,
        prompt_language=language,
        text=target_text,
        text_language=language,
        how_to_cut=i18n("不切"),
        top_k=20,
        top_p=0.6,
        temperature=0.6,
        speed=1.0,
    )
)

if not chunks:
    raise RuntimeError("GPT-SoVITS returned no audio chunks")
sample_rate = chunks[-1][0]
audio = chunks[-1][1]
output_name = os.environ.get("GPT_SOVITS_OUTPUT", "gpt-sovits-v2-cpu.wav")
wavfile.write(OUT / output_name, sample_rate, audio)
print(f"saved {OUT / output_name} sr={sample_rate} samples={len(audio)}")
