"""Create the static Tauri updater manifest from signed release artifacts."""
import json
import sys
from pathlib import Path


def main() -> None:
    directory = Path(sys.argv[1])
    repository = sys.argv[2]
    tag = sys.argv[3]
    if not tag.startswith("v"):
        raise ValueError("Release tag must start with v")

    assets = {
        "darwin-aarch64": "Annotate-macOS-ARM64.app.tar.gz",
        "windows-x86_64": "Annotate-Windows-x64-setup.exe",
    }
    platforms = {}
    for platform, filename in assets.items():
        artifact = directory / filename
        signature = directory / f"{filename}.sig"
        if not artifact.is_file() or not signature.is_file():
            raise FileNotFoundError(f"Missing signed updater artifact: {filename}")
        platforms[platform] = {
            "url": f"https://github.com/{repository}/releases/download/{tag}/{filename}",
            "signature": signature.read_text(encoding="utf-8").strip(),
        }

    manifest = {"version": tag[1:], "platforms": platforms}
    (directory / "latest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )


if __name__ == "__main__":
    main()
