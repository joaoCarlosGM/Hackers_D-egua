"""Extract supplied artwork intact. Optional maintenance command; never run by the app.
Requires PyMuPDF only to extract the PDF's original images and their original masks.
"""
from pathlib import Path
from hashlib import sha256
from io import BytesIO
import json
import zipfile
import fitz

root = Path(__file__).resolve().parent.parent
archive = root / "hackers_pai_degua_referencias.zip"
output = root / "public/assets"
prefix = "hackers_pai_degua_referencias/"
manifest = {"archive_sha256": sha256(archive.read_bytes()).hexdigest(), "assets": []}
with zipfile.ZipFile(archive) as source:
    copies = {
        "logos/referencia-1.png": "brand/logo-artista-original.png",
        "logos/referencia-2.png": "brand/logo-chapeu-original.png",
        "logos/referencia-3.png": "brand/logo-boina-original.png",
        "logos/referencia-4.png": "brand/mascote-pixel-original.png",
        "ranking_referencia.png": "references/ranking-referencia.png",
        "paleta_oficial.png": "references/paleta-oficial.png",
        "identidade_visual_origem.pdf": "references/identidade-visual-original.pdf",
    }
    for original, name in copies.items():
        data = source.read(prefix + original)
        target = output / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
        manifest["assets"].append({"file": name, "source": original, "sha256": sha256(data).hexdigest(), "operation": "byte-for-byte copy"})
    with fitz.open(stream=BytesIO(source.read(prefix + "identidade_visual_origem.pdf")), filetype="pdf") as pdf:
        images = pdf[1].get_images(full=True)
        # Page two contains the shield and the complete wordmark as separate originals.
        for record, name in zip(images, ["mascote-chapeu-transparente.png", "logo-completo-transparente.png"], strict=True):
            xref, mask = record[:2]
            original = fitz.Pixmap(pdf, xref)
            alpha = fitz.Pixmap(pdf, mask)
            rgba = fitz.Pixmap(original, alpha)
            target = output / "brand" / name
            rgba.save(target)
            manifest["assets"].append({"file": "brand/" + name, "source": "identidade_visual_origem.pdf, page 2", "image_xref": xref, "original_mask_xref": mask, "width": rgba.width, "height": rgba.height, "sha256": sha256(target.read_bytes()).hexdigest(), "operation": "original embedded image + original soft mask; no crop, recolor or redraw"})
(output / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")
print("Extracted", len(manifest["assets"]), "original assets to public/assets")
