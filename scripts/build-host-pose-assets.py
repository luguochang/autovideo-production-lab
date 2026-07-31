#!/usr/bin/env python3
"""Build deterministic transparent host-pose assets from POSE_MANIFEST.json."""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont, __version__ as pillow_version


GENERATOR_VERSION = "autovideo-host-pose-assets/v1"
DEFAULT_POSE_MANIFEST = Path(
    "style-library/styles/project/modern-ip-host-explainer/POSE_MANIFEST.json"
)
DEFAULT_REMOVE_SCRIPT = Path("scripts/remove-connected-background.py")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Verify, remove backgrounds, normalize and receipt canonical host poses."
    )
    parser.add_argument(
        "--workspace-root",
        type=Path,
        default=Path(__file__).resolve().parents[1],
    )
    parser.add_argument(
        "--project",
        required=True,
        help="Formal project ID or path.",
    )
    parser.add_argument("--pose-manifest", type=Path, default=DEFAULT_POSE_MANIFEST)
    parser.add_argument("--remove-script", type=Path, default=DEFAULT_REMOVE_SCRIPT)
    parser.add_argument("--output-dir", type=Path)
    parser.add_argument("--target-width", type=int, default=600)
    parser.add_argument("--target-height", type=int, default=730)
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--min-r", type=int, default=205)
    parser.add_argument("--min-g", type=int, default=180)
    parser.add_argument("--min-b", type=int, default=155)
    parser.add_argument("--min-rg", type=int, default=5)
    parser.add_argument("--max-rg", type=int, default=55)
    parser.add_argument("--min-gb", type=int, default=0)
    parser.add_argument("--max-gb", type=int, default=55)
    return parser.parse_args()


def resolve_inside(root: Path, value: Path) -> Path:
    resolved = value if value.is_absolute() else root / value
    resolved = resolved.resolve()
    try:
        resolved.relative_to(root.resolve())
    except ValueError as error:
        raise RuntimeError(f"Path escapes workspace root: {resolved}") from error
    return resolved


def resolve_project(workspace_root: Path, value: str) -> Path:
    candidate = Path(value)
    if candidate.is_absolute() or len(candidate.parts) > 1:
        return resolve_inside(workspace_root, candidate)
    return resolve_inside(
        workspace_root,
        Path("hyperframes-workflow-kit/projects") / candidate,
    )


def sha256_file(file_path: Path) -> str:
    digest = hashlib.sha256()
    with file_path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def relative_path(root: Path, file_path: Path) -> str:
    return file_path.resolve().relative_to(root.resolve()).as_posix()


def png_bytes(image: Image.Image) -> bytes:
    output = io.BytesIO()
    image.save(output, format="PNG", optimize=False, compress_level=6)
    return output.getvalue()


def write_if_changed(file_path: Path, content: bytes) -> bool:
    if file_path.exists() and file_path.read_bytes() == content:
        return False
    file_path.parent.mkdir(parents=True, exist_ok=True)
    file_path.write_bytes(content)
    return True


def parse_dimensions(value: str) -> tuple[int, int]:
    width, height = value.lower().split("x", 1)
    return int(width), int(height)


def alpha_metrics(image: Image.Image) -> dict[str, object]:
    alpha = np.asarray(image.getchannel("A"), dtype=np.uint8)
    bbox = image.getchannel("A").getbbox()
    if bbox is None:
        raise RuntimeError("Background removal produced an empty alpha image.")
    nonzero = int(np.count_nonzero(alpha))
    partial = int(np.count_nonzero((alpha > 0) & (alpha < 255)))
    return {
        "bbox": list(bbox),
        "nonTransparentPixels": nonzero,
        "partiallyTransparentPixels": partial,
        "coverage": round(nonzero / alpha.size, 6),
    }


def normalize_pose(
    transparent: Image.Image,
    target_width: int,
    target_height: int,
) -> tuple[Image.Image, dict[str, object]]:
    rgba = transparent.convert("RGBA")
    source_metrics = alpha_metrics(rgba)
    left, top, right, bottom = source_metrics["bbox"]
    crop = rgba.crop((left, top, right, bottom))
    crop_width, crop_height = crop.size
    scale = min(target_width / crop_width, target_height / crop_height)
    resized_width = max(1, round(crop_width * scale))
    resized_height = max(1, round(crop_height * scale))
    resized = crop.resize((resized_width, resized_height), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (target_width, target_height), (0, 0, 0, 0))
    offset_x = (target_width - resized_width) // 2
    offset_y = target_height - resized_height
    canvas.alpha_composite(resized, (offset_x, offset_y))
    return canvas, {
        "method": "alpha-bbox-fit-bottom-center",
        "sourceAlpha": source_metrics,
        "crop": [left, top, right, bottom],
        "scale": round(scale, 9),
        "resized": [resized_width, resized_height],
        "offset": [offset_x, offset_y],
        "outputAlpha": alpha_metrics(canvas),
        "eyeLineDetection": "not-performed; contact-sheet human review required",
    }


def load_font(size: int) -> ImageFont.ImageFont:
    candidates = [
        Path("C:/Windows/Fonts/arial.ttf"),
        Path("C:/Windows/Fonts/segoeui.ttf"),
    ]
    for candidate in candidates:
        if candidate.exists():
            return ImageFont.truetype(str(candidate), size)
    return ImageFont.load_default()


def checkerboard(width: int, height: int, cell: int = 18) -> Image.Image:
    board = Image.new("RGB", (width, height), "#F7F4EF")
    draw = ImageDraw.Draw(board)
    for y in range(0, height, cell):
        for x in range(0, width, cell):
            if (x // cell + y // cell) % 2:
                draw.rectangle((x, y, x + cell - 1, y + cell - 1), fill="#E5E0D9")
    return board


def build_contact_sheet(entries: list[dict[str, object]], output_root: Path) -> Image.Image:
    width, height = 1920, 1080
    sheet = Image.new("RGB", (width, height), "#F2DFC7")
    draw = ImageDraw.Draw(sheet)
    title_font = load_font(32)
    label_font = load_font(24)
    subtitle_font = load_font(18)
    note_font = load_font(16)
    draw.text((60, 28), "AutoVideo canonical host poses | 600x730 RGBA", fill="#2A211B", font=title_font)
    draw.text((60, 70), "Checkerboard shows transparency. Review head top, eye line, scale, hands and bottom crop.", fill="#675748", font=subtitle_font)

    columns = 5
    cell_width = 360
    cell_height = 465
    start_x = 60
    start_y = 115
    preview_width = 292
    preview_height = 355
    for index, entry in enumerate(entries):
        column = index % columns
        row = index // columns
        x = start_x + column * cell_width
        y = start_y + row * cell_height
        draw.rounded_rectangle((x, y, x + 330, y + 448), radius=8, fill="#FBF3E7", outline="#DCC2A3", width=2)
        preview = checkerboard(preview_width, preview_height)
        pose = Image.open(output_root / entry["output"]["path"]).convert("RGBA")
        thumb = pose.copy()
        thumb.thumbnail((preview_width, preview_height), Image.Resampling.LANCZOS)
        preview.paste(thumb, ((preview_width - thumb.width) // 2, preview_height - thumb.height), thumb)
        sheet.paste(preview, (x + 19, y + 18))
        draw.text((x + 19, y + 382), str(entry["id"]), fill="#2A211B", font=label_font)
        source_size = entry["source"]["dimensions"]
        output_bbox = entry["normalization"]["outputAlpha"]["bbox"]
        draw.text((x + 19, y + 414), f"src {source_size[0]}x{source_size[1]} | bbox {output_bbox}", fill="#675748", font=note_font)
    return sheet


def run_background_removal(
    python: Path,
    remove_script: Path,
    source: Path,
    output: Path,
    thresholds: dict[str, int],
) -> str:
    command = [str(python), str(remove_script), str(source), str(output)]
    for key, value in thresholds.items():
        command.extend([f"--{key.replace('_', '-')}", str(value)])
    result = subprocess.run(command, check=True, capture_output=True, text=True)
    return result.stdout.strip()


def main() -> None:
    args = parse_args()
    workspace_root = args.workspace_root.resolve()
    project_root = resolve_project(workspace_root, args.project)
    pose_manifest_path = resolve_inside(workspace_root, args.pose_manifest)
    remove_script = resolve_inside(workspace_root, args.remove_script)
    output_root = (
        resolve_inside(workspace_root, args.output_dir)
        if args.output_dir
        else project_root / "production-assets"
    )
    if args.target_width <= 0 or args.target_height <= 0:
        raise RuntimeError("Target dimensions must be positive.")

    pose_manifest = json.loads(pose_manifest_path.read_text(encoding="utf-8"))
    if pose_manifest.get("status") != "approved":
        raise RuntimeError("POSE_MANIFEST must be approved before production asset generation.")
    poses = pose_manifest.get("poses", [])
    if len(poses) != 10:
        raise RuntimeError(f"Expected 10 canonical poses, received {len(poses)}.")

    source_root = resolve_inside(workspace_root, Path(pose_manifest["sourceRoot"]))
    thresholds = {
        "min_r": args.min_r,
        "min_g": args.min_g,
        "min_b": args.min_b,
        "min_rg": args.min_rg,
        "max_rg": args.max_rg,
        "min_gb": args.min_gb,
        "max_gb": args.max_gb,
    }
    pose_manifest_sha = sha256_file(pose_manifest_path)
    remove_script_sha = sha256_file(remove_script)
    derivation_common = {
        "generatorVersion": GENERATOR_VERSION,
        "poseManifestSha256": pose_manifest_sha,
        "backgroundRemovalScriptSha256": remove_script_sha,
        "backgroundRemovalParameters": thresholds,
        "target": [args.target_width, args.target_height],
        "normalization": "alpha-bbox-fit-bottom-center",
    }

    manifest_path = output_root / "host-assets.manifest.json"
    existing_manifest = None
    if manifest_path.exists() and not args.force:
        try:
            existing_manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            existing_manifest = None
    existing_by_id = {
        entry["id"]: entry
        for entry in (existing_manifest or {}).get("poses", [])
        if isinstance(entry, dict) and "id" in entry
    }

    output_root.mkdir(parents=True, exist_ok=True)
    pose_output_dir = output_root / "host"
    pose_output_dir.mkdir(parents=True, exist_ok=True)
    results: list[dict[str, object]] = []
    regenerated = 0
    reused = 0

    with tempfile.TemporaryDirectory(prefix="pose-build-", dir=output_root) as temp_value:
        temp_dir = Path(temp_value)
        for pose in poses:
            pose_id = pose["id"]
            source = resolve_inside(workspace_root, source_root / pose["file"])
            actual_source_sha = sha256_file(source)
            if actual_source_sha != pose["sha256"]:
                raise RuntimeError(
                    f"Source SHA mismatch for {pose_id}: expected {pose['sha256']}, received {actual_source_sha}."
                )
            with Image.open(source) as source_image:
                actual_dimensions = source_image.size
            if actual_dimensions != parse_dimensions(pose["dimensions"]):
                raise RuntimeError(
                    f"Source dimensions mismatch for {pose_id}: expected {pose['dimensions']}, received {actual_dimensions}."
                )

            output_path = pose_output_dir / f"{pose_id}.png"
            fingerprint = hashlib.sha256(
                json.dumps(
                    {**derivation_common, "poseId": pose_id, "sourceSha256": actual_source_sha},
                    ensure_ascii=False,
                    sort_keys=True,
                    separators=(",", ":"),
                ).encode("utf-8")
            ).hexdigest()
            existing = existing_by_id.get(pose_id)
            can_reuse = (
                not args.force
                and existing
                and existing.get("derivationFingerprint") == fingerprint
                and output_path.exists()
                and sha256_file(output_path) == existing.get("output", {}).get("sha256")
            )

            if can_reuse:
                with Image.open(output_path) as existing_image:
                    can_reuse = existing_image.mode == "RGBA" and existing_image.size == (
                        args.target_width,
                        args.target_height,
                    )
            if can_reuse:
                results.append(existing)
                reused += 1
                continue

            transparent_path = temp_dir / f"{pose_id}-transparent.png"
            removal_log = run_background_removal(
                Path(sys.executable),
                remove_script,
                source,
                transparent_path,
                thresholds,
            )
            with Image.open(transparent_path) as transparent_image:
                normalized, normalization = normalize_pose(
                    transparent_image,
                    args.target_width,
                    args.target_height,
                )
            output_content = png_bytes(normalized)
            write_if_changed(output_path, output_content)
            results.append(
                {
                    "id": pose_id,
                    "use": pose["use"],
                    "source": {
                        "path": relative_path(workspace_root, source),
                        "sha256": actual_source_sha,
                        "dimensions": list(actual_dimensions),
                        "license": "user-provided",
                        "rightsStatus": "needs-review",
                    },
                    "output": {
                        "path": relative_path(output_root, output_path),
                        "sha256": sha256_bytes(output_content),
                        "dimensions": [args.target_width, args.target_height],
                        "mode": "RGBA",
                    },
                    "normalization": normalization,
                    "backgroundRemovalLog": removal_log,
                    "mirrorAllowed": bool(pose.get("mirrorAllowed")),
                    "requiresMirrorFor": pose.get("requiresMirrorFor", []),
                    "derivationFingerprint": fingerprint,
                }
            )
            regenerated += 1

    contact_sheet_path = output_root / "review" / "host-poses-contact-sheet.png"
    contact_sheet = build_contact_sheet(results, output_root)
    contact_content = png_bytes(contact_sheet)
    contact_changed = write_if_changed(contact_sheet_path, contact_content)
    manifest = {
        "schemaVersion": "autovideo-host-assets-manifest/v1",
        "projectId": project_root.name,
        "styleId": pose_manifest["styleId"],
        "generator": {
            "version": GENERATOR_VERSION,
            "script": relative_path(workspace_root, Path(__file__).resolve()),
            "python": sys.version.split()[0],
            "pythonExecutable": relative_path(workspace_root, Path(sys.executable)),
            "pillow": pillow_version,
            "numpy": np.__version__,
        },
        "sourceManifest": {
            "path": relative_path(workspace_root, pose_manifest_path),
            "sha256": pose_manifest_sha,
        },
        "backgroundRemoval": {
            "script": relative_path(workspace_root, remove_script),
            "sha256": remove_script_sha,
            "parameters": thresholds,
        },
        "normalization": {
            "targetCanvas": [args.target_width, args.target_height],
            "method": "alpha-bbox-fit-bottom-center",
            "anchorIntent": pose_manifest["normalization"]["anchor"],
            "eyeLineDetection": "not-performed",
            "reviewRequired": ["head-top", "eye-line", "head-scale", "hands", "bottom-crop"],
        },
        "rightsStatus": "needs-review: inherits user-provided POSE_MANIFEST source rights",
        "poses": results,
        "contactSheet": {
            "path": relative_path(output_root, contact_sheet_path),
            "sha256": sha256_bytes(contact_content),
            "dimensions": [contact_sheet.width, contact_sheet.height],
            "reviewStatus": "pending",
        },
    }
    manifest_content = (
        json.dumps(manifest, ensure_ascii=False, indent=2).encode("utf-8") + b"\n"
    )
    manifest_changed = write_if_changed(manifest_path, manifest_content)
    print(
        json.dumps(
            {
                "ok": True,
                "projectId": project_root.name,
                "poses": len(results),
                "regenerated": regenerated,
                "reused": reused,
                "manifestChanged": manifest_changed,
                "contactSheetChanged": contact_changed,
                "manifest": relative_path(project_root, manifest_path),
                "contactSheet": relative_path(project_root, contact_sheet_path),
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
