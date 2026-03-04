"""
Scrapes historical OpenGov proposals from Polkassembly.
Target: 300+ proposals with outcome labels.
Output: ml/data/proposals.csv
"""
import httpx
import pandas as pd
import asyncio
import json
from pathlib import Path

API_BASE = "https://api.polkassembly.io/api/v1"
HEADERS = {"x-network": "polkadot", "Content-Type": "application/json"}


async def fetch_proposals(page: int, limit: int = 100) -> list:
    """Fetch a page of referendum listings."""
    async with httpx.AsyncClient() as client:
        r = await client.get(
            f"{API_BASE}/listing/on-chain-posts",
            params={
                "proposalType": "referendums_v2",
                "page": page,
                "listingLimit": limit,
                "sortBy": "newest",
            },
            headers=HEADERS,
            timeout=30,
        )
        return r.json().get("posts", [])


async def fetch_proposal_detail(post_id: int) -> dict:
    """Fetch detailed data for a single referendum."""
    async with httpx.AsyncClient() as client:
        r = await client.get(
            f"{API_BASE}/posts/on-chain-post",
            params={"postId": post_id, "proposalType": "referendums_v2"},
            headers=HEADERS,
            timeout=30,
        )
        return r.json()


def extract_features(post: dict, detail: dict) -> dict:
    """
    Extract 8 features + label from raw API response.
    Label: high_risk = 1 if rejected, timed out, cancelled,
           or requested > 3x avg, or proposer_age < threshold.
    """
    status = post.get("status", "")
    requested_dot = float(detail.get("requested", 0)) / 1e18
    proposer = detail.get("proposer", "")

    return {
        "ref_index": post.get("post_id"),
        "requested_dot": requested_dot,
        "track_id": post.get("track_no", 0),
        "status": status,
        "proposer": proposer,
        "wallet_age_blocks": detail.get("wallet_age_blocks", 0),
        "prior_approved": detail.get("prior_approved", 0),
        "prior_total": detail.get("prior_total", 0),
        "days_since_last_prop": detail.get("days_since_last", 999),
        "high_risk": 1 if status in ["Rejected", "TimedOut", "Cancelled"] else 0,
    }


async def main():
    all_proposals = []
    for page in range(1, 6):  # Up to 500 proposals
        posts = await fetch_proposals(page)
        if not posts:
            break
        for post in posts:
            detail = await fetch_proposal_detail(post["post_id"])
            all_proposals.append(extract_features(post, detail))
        await asyncio.sleep(1)  # Rate limit

    df = pd.DataFrame(all_proposals)
    Path("data").mkdir(exist_ok=True)
    df.to_csv("data/proposals.csv", index=False)
    print(f"Saved {len(df)} proposals")


if __name__ == "__main__":
    asyncio.run(main())
