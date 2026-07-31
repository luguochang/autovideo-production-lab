from pathlib import Path

import requests
from tqdm import tqdm


ROOT = Path(__file__).resolve().parent / "GPT-SoVITS" / "GPT_SoVITS"
BASE = "https://www.modelscope.cn/models/XXXXRT/GPT-SoVITS-Pretrained/resolve/master/"
FILES = {
    "pretrained_models/chinese-hubert-base/config.json": 1449,
    "pretrained_models/chinese-hubert-base/preprocessor_config.json": 212,
    "pretrained_models/chinese-hubert-base/pytorch_model.bin": 188811417,
    "pretrained_models/chinese-roberta-wwm-ext-large/config.json": 963,
    "pretrained_models/chinese-roberta-wwm-ext-large/tokenizer.json": 268962,
    "pretrained_models/chinese-roberta-wwm-ext-large/pytorch_model.bin": 651225145,
    "pretrained_models/gsv-v2final-pretrained/s1bert25hz-5kh-longer-epoch=12-step=369668.ckpt": 155315150,
    "pretrained_models/gsv-v2final-pretrained/s2G2333k.pth": 106035259,
    "pretrained_models/sv/pretrained_eres2netv2w24s4ep4.ckpt": 107528697,
    "pretrained_models/fast_langdetect/lid.176.bin": 131266198,
    "pretrained_models/fast_langdetect/lid.176.ftz": 938013,
}


def download(rel: str, expected: int) -> None:
    out = ROOT / rel
    if out.exists() and out.stat().st_size == expected:
        print(f"skip {rel} ({expected:,} bytes)")
        return
    out.parent.mkdir(parents=True, exist_ok=True)
    tmp = out.with_suffix(out.suffix + ".part")
    url = BASE + rel
    offset = tmp.stat().st_size if tmp.exists() else 0
    headers = {"Range": f"bytes={offset}-"} if offset else {}
    with requests.get(url, headers=headers, stream=True, timeout=120) as response:
        response.raise_for_status()
        if offset and response.status_code != 206:
            tmp.unlink(missing_ok=True)
            offset = 0
            response.close()
            return download(rel, expected)
        total = int(response.headers.get("content-length", expected))
        mode = "ab" if offset else "wb"
        with tmp.open(mode) as handle, tqdm(
            total=expected, initial=offset, unit="B", unit_scale=True, desc=rel, miniters=1
        ) as progress:
            for chunk in response.iter_content(chunk_size=1024 * 1024):
                if chunk:
                    handle.write(chunk)
                    progress.update(len(chunk))
    if tmp.stat().st_size != expected:
        raise RuntimeError(f"size mismatch for {rel}: {tmp.stat().st_size} != {expected}")
    tmp.replace(out)


for path, size in FILES.items():
    download(path, size)
