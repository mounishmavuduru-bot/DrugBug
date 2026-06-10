"""ArcFace / bilinear-CNN embedding network definition (PRD §10.1 layer 3).

A real metric-learning backbone usable by `training/train_pill_embedder.py` on
GPU. torch / torchvision are heavy deps imported lazily inside `build_embedder`
so this file stays importable without them.
"""

from __future__ import annotations


def build_embedder(emb_dim: int = 512, backbone: str = "resnet50"):
    """Return an embedding network: CNN backbone -> L2-normalized embedding.

    Trained with an ArcFace margin head (the head lives in the training script;
    serving only needs the embedding trunk). Raises ImportError if torch /
    torchvision are missing (caught by the loader).
    """
    import torch
    import torch.nn as nn
    import torch.nn.functional as F
    import torchvision

    class BilinearPool(nn.Module):
        """Compact bilinear pooling for fine-grained pill texture features."""

        def forward(self, x):
            b, c, h, w = x.shape
            x = x.view(b, c, h * w)
            bilinear = torch.bmm(x, x.transpose(1, 2)) / (h * w)
            bilinear = bilinear.view(b, c * c)
            bilinear = torch.sign(bilinear) * torch.sqrt(torch.abs(bilinear) + 1e-10)
            return F.normalize(bilinear, dim=1)

    class PillEmbedderNet(nn.Module):
        def __init__(self, emb_dim: int):
            super().__init__()
            net = getattr(torchvision.models, backbone)(weights=None)
            self.features = nn.Sequential(*list(net.children())[:-2])
            feat_dim = 2048 if backbone in ("resnet50", "resnet101") else 512
            self.pool = nn.AdaptiveAvgPool2d(1)
            self.embed = nn.Linear(feat_dim, emb_dim)

        def forward(self, x):
            f = self.features(x)
            pooled = self.pool(f).flatten(1)
            emb = self.embed(pooled)
            return F.normalize(emb, dim=1)

    return PillEmbedderNet(emb_dim)


class ArcMarginProduct:
    """Documentation marker for the ArcFace margin head used during training.

    The actual nn.Module is constructed in `training/train_pill_embedder.py`
    (it needs the class count, which is dataset-dependent). Kept here as a
    reference to the intended loss so serving and training stay in sync.
    """

    margin = 0.5
    scale = 64.0
