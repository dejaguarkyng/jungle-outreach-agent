from __future__ import annotations

from . import discord, github, hackernews, reddit, x

ADAPTER_REGISTRY = {
    "reddit": reddit.collect_candidates,
    "hackernews": hackernews.collect_candidates,
    "github": github.collect_candidates,
    "x": x.collect_candidates,
    "discord": discord.collect_candidates,
}

