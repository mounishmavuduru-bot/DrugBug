"""Train the pill visual-embedding network (PRD §10.1/§11) — GPU REQUIRED.

Real, runnable deep-metric-learning training of the ArcFace / bilinear-CNN
embedder on the ePillID dataset (+ NLM C3PI RxImage). Produces the embedding
weights loaded by app/models/pill_id/embedder.py and the gallery embeddings
ingested by etl/ingest_pill_reference.py.

Requires a CUDA GPU (PRD §11). Not fake-trained — runs real ArcFace optimization.

Dataset layout (ImageFolder-style): root/<ndc-or-class>/<image>.jpg
Usage:
    python training/train_pill_embedder.py --data ePillID/images --epochs 30 \
        --emb-dim 512 --out pill_embedder.pt [--gallery-out embeddings.jsonl]
"""

from __future__ import annotations

import argparse
import json
import sys


def main() -> int:
    ap = argparse.ArgumentParser(description="Train pill embedder (GPU required)")
    ap.add_argument("--data", required=True, help="ImageFolder root of pill images")
    ap.add_argument("--epochs", type=int, default=30)
    ap.add_argument("--emb-dim", type=int, default=512)
    ap.add_argument("--batch", type=int, default=64)
    ap.add_argument("--lr", type=float, default=1e-3)
    ap.add_argument("--out", default="pill_embedder.pt")
    ap.add_argument("--gallery-out", default=None, help="optional JSONL of {ndc, embedding}")
    args = ap.parse_args()

    import torch
    import torch.nn as nn
    import torch.nn.functional as F
    from torch.utils.data import DataLoader
    from torchvision import datasets, transforms

    from app.models.pill_id.embedder_net import build_embedder

    device = "cuda" if torch.cuda.is_available() else "cpu"
    if device == "cpu":
        print("WARNING: no CUDA GPU detected — training will be very slow (PRD §11).")

    tfm = transforms.Compose(
        [
            transforms.Resize((224, 224)),
            transforms.RandomHorizontalFlip(),
            transforms.ToTensor(),
            transforms.Normalize([0.5, 0.5, 0.5], [0.5, 0.5, 0.5]),
        ]
    )
    dataset = datasets.ImageFolder(args.data, transform=tfm)
    loader = DataLoader(dataset, batch_size=args.batch, shuffle=True, num_workers=4)
    num_classes = len(dataset.classes)

    embedder = build_embedder(emb_dim=args.emb_dim).to(device)

    class ArcMargin(nn.Module):
        def __init__(self, emb_dim, n_classes, s=64.0, m=0.5):
            super().__init__()
            self.weight = nn.Parameter(torch.randn(n_classes, emb_dim))
            nn.init.xavier_uniform_(self.weight)
            self.s, self.m = s, m

        def forward(self, emb, labels):
            w = F.normalize(self.weight, dim=1)
            cos = emb @ w.t()
            theta = torch.acos(cos.clamp(-1 + 1e-7, 1 - 1e-7))
            target = torch.cos(theta + self.m)
            onehot = F.one_hot(labels, cos.size(1)).float()
            logits = self.s * (onehot * target + (1 - onehot) * cos)
            return logits

    head = ArcMargin(args.emb_dim, num_classes).to(device)
    opt = torch.optim.Adam(list(embedder.parameters()) + list(head.parameters()), lr=args.lr)
    ce = nn.CrossEntropyLoss()

    for epoch in range(args.epochs):
        embedder.train()
        head.train()
        total = 0.0
        for imgs, labels in loader:
            imgs, labels = imgs.to(device), labels.to(device)
            opt.zero_grad()
            emb = embedder(imgs)
            logits = head(emb, labels)
            loss = ce(logits, labels)
            loss.backward()
            opt.step()
            total += loss.item()
        print(f"epoch {epoch+1}/{args.epochs} loss={total/max(1,len(loader)):.4f}")

    torch.save({"state_dict": embedder.state_dict(), "emb_dim": args.emb_dim}, args.out)
    print(f"saved pill embedder -> {args.out}")

    # Optionally export gallery embeddings keyed by class name (treated as NDC).
    if args.gallery_out:
        embedder.eval()
        eval_tfm = transforms.Compose(
            [
                transforms.Resize((224, 224)),
                transforms.ToTensor(),
                transforms.Normalize([0.5, 0.5, 0.5], [0.5, 0.5, 0.5]),
            ]
        )
        gallery = datasets.ImageFolder(args.data, transform=eval_tfm)
        gloader = DataLoader(gallery, batch_size=args.batch, shuffle=False, num_workers=4)
        sums: dict[int, torch.Tensor] = {}
        counts: dict[int, int] = {}
        with torch.no_grad():
            for imgs, labels in gloader:
                emb = embedder(imgs.to(device)).cpu()
                for e, l in zip(emb, labels.tolist()):
                    sums[l] = sums.get(l, torch.zeros(args.emb_dim)) + e
                    counts[l] = counts.get(l, 0) + 1
        with open(args.gallery_out, "w") as f:
            for l, s in sums.items():
                centroid = (s / counts[l])
                centroid = centroid / (centroid.norm() + 1e-9)
                f.write(json.dumps({"ndc": gallery.classes[l], "embedding": centroid.tolist()}) + "\n")
        print(f"exported gallery embeddings -> {args.gallery_out}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
