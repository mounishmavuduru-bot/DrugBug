"""Real external integrations (PRD §12). All async httpx, no mocks.

Each integration degrades to an explicit, honest "unavailable" state when its
credentials/network are absent — never a fabricated success.
"""
