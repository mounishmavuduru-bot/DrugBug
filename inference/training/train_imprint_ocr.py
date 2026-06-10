"""Fine-tune the imprint OCR model (PRD §10.1/§11) — GPU REQUIRED.

Real, runnable fine-tuning of TrOCR (microsoft/trocr-base-printed) on pill-imprint
crops labeled with their imprint code. Produces the weights loaded by
app/models/pill_id/imprint_ocr.py (saved via save_pretrained so TrOCRProcessor /
VisionEncoderDecoderModel can load them by path).

Requires a CUDA GPU (PRD §11) and transformers + torch. Not fake-trained.

Dataset: a JSONL manifest of {image_path, imprint} pairs.
Usage:
    python training/train_imprint_ocr.py --manifest imprints.jsonl --epochs 5 \
        --out trocr_imprint/
"""

from __future__ import annotations

import argparse
import json
import sys


def main() -> int:
    ap = argparse.ArgumentParser(description="Fine-tune TrOCR for pill imprints (GPU required)")
    ap.add_argument("--manifest", required=True, help="JSONL of {image_path, imprint}")
    ap.add_argument("--base", default="microsoft/trocr-base-printed")
    ap.add_argument("--epochs", type=int, default=5)
    ap.add_argument("--batch", type=int, default=8)
    ap.add_argument("--lr", type=float, default=5e-5)
    ap.add_argument("--out", default="trocr_imprint")
    args = ap.parse_args()

    import torch
    from PIL import Image
    from torch.utils.data import DataLoader, Dataset
    from transformers import TrOCRProcessor, VisionEncoderDecoderModel

    device = "cuda" if torch.cuda.is_available() else "cpu"
    if device == "cpu":
        print("WARNING: no CUDA GPU detected — training will be very slow (PRD §11).")

    processor = TrOCRProcessor.from_pretrained(args.base)
    model = VisionEncoderDecoderModel.from_pretrained(args.base).to(device)
    model.config.decoder_start_token_id = processor.tokenizer.cls_token_id
    model.config.pad_token_id = processor.tokenizer.pad_token_id
    model.config.vocab_size = model.config.decoder.vocab_size

    examples = []
    with open(args.manifest) as f:
        for line in f:
            line = line.strip()
            if line:
                examples.append(json.loads(line))

    class ImprintDataset(Dataset):
        def __len__(self):
            return len(examples)

        def __getitem__(self, i):
            ex = examples[i]
            img = Image.open(ex["image_path"]).convert("RGB")
            pixel_values = processor(images=img, return_tensors="pt").pixel_values.squeeze(0)
            labels = processor.tokenizer(
                ex["imprint"], padding="max_length", max_length=24, truncation=True
            ).input_ids
            labels = [l if l != processor.tokenizer.pad_token_id else -100 for l in labels]
            return pixel_values, torch.tensor(labels)

    loader = DataLoader(ImprintDataset(), batch_size=args.batch, shuffle=True, num_workers=4)
    opt = torch.optim.AdamW(model.parameters(), lr=args.lr)

    for epoch in range(args.epochs):
        model.train()
        total = 0.0
        for pixel_values, labels in loader:
            pixel_values, labels = pixel_values.to(device), labels.to(device)
            opt.zero_grad()
            out = model(pixel_values=pixel_values, labels=labels)
            out.loss.backward()
            opt.step()
            total += out.loss.item()
        print(f"epoch {epoch+1}/{args.epochs} loss={total/max(1,len(loader)):.4f}")

    model.save_pretrained(args.out)
    processor.save_pretrained(args.out)
    print(f"saved fine-tuned TrOCR -> {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
