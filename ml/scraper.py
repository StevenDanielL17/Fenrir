"""
Fenrir — Polkassembly / Subsquare Data Scraper
=================================================
Collects historical OpenGov proposals for ML training.
Fetches proposal metadata, proposer history, and outcomes
from public governance APIs.

Usage:
    python scraper.py --output data/proposals.csv
    python scraper.py --output data/proposals.csv --limit 300
"""

import argparse
import csv
import json
import logging
import os
import time
from datetime import datetime, timezone

import requests

# -----------------------------------------------------------------------
# Configuration
# -----------------------------------------------------------------------

POLKASSEMBLY_API = "https://api.polkassembly.io/api/v1"
SUBSQUARE_API = "https://polkadot.subsquare.io/api"

# Headers required by Polkassembly
POLKASSEMBLY_HEADERS = {
    "x-network": "polkadot",
    "Content-Type": "application/json",
}

# Rate limiting — be a good citizen
REQUEST_DELAY_SECONDS = 0.5

# Logging setup
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger("fenrir.scraper")

# -----------------------------------------------------------------------
# Feature Vector Definition
# -----------------------------------------------------------------------
# These are the features we extract for each proposal.
# They map directly to the model's input vector as specified
# in the BASE_INSTRUCTIONS (Section 5).
#
# wallet_age_blocks    — blocks since first on-chain activity
# dot_requested        — DOT amount requested (normalised)
# dot_ratio_to_avg     — requested / ecosystem average at time
# prior_approved       — number of approved proposals by proposer
# prior_total          — total proposals submitted by proposer
# approval_rate        — prior_approved / prior_total
# track_id             — OpenGov track (0=root, 1=whitelisted, etc.)
# days_since_last_prop — burst detection feature
# high_risk            — label: 1 = rejected/flagged, 0 = passed cleanly

CSV_HEADERS = [
    "ref_index",
    "proposer",
    "wallet_age_blocks",
    "dot_requested",
    "dot_ratio_to_avg",
    "prior_approved",
    "prior_total",
    "approval_rate",
    "track_id",
    "days_since_last_prop",
    "status",
    "high_risk",
]


def fetch_referenda_list(page=1, limit=50):
    """
    Fetch a paginated list of OpenGov referenda from Polkassembly.

    Returns a list of proposal summaries including ref index,
    status, track, and requested amounts.
    """
    try:
        url = f"{POLKASSEMBLY_API}/listing/on-chain-posts"
        params = {
            "proposalType": "referendums_v2",
            "page": page,
            "listingLimit": limit,
            "sortBy": "newest",
        }
        response = requests.get(
            url, headers=POLKASSEMBLY_HEADERS, params=params, timeout=30
        )
        response.raise_for_status()
        data = response.json()
        return data.get("posts", [])
    except requests.RequestException as e:
        logger.warning("Failed to fetch referenda list page %d: %s", page, e)
        return []


def fetch_proposal_detail(ref_index):
    """
    Fetch detailed information for a single referendum.

    Retrieves the full proposal details including proposer address,
    requested amount, track, and timeline information.
    """
    try:
        url = f"{POLKASSEMBLY_API}/posts/on-chain-post"
        params = {
            "proposalType": "referendums_v2",
            "postId": ref_index,
        }
        response = requests.get(
            url, headers=POLKASSEMBLY_HEADERS, params=params, timeout=30
        )
        response.raise_for_status()
        return response.json()
    except requests.RequestException as e:
        logger.warning("Failed to fetch detail for REF #%s: %s", ref_index, e)
        return None


def fetch_proposer_history(address):
    """
    Fetch a proposer's historical activity from Subsquare.

    Returns the number of prior proposals and their outcomes,
    enabling us to compute approval rates and detect first-time
    proposers.
    """
    try:
        url = f"{SUBSQUARE_API}/users/{address}/proposals"
        response = requests.get(url, timeout=30)
        response.raise_for_status()
        data = response.json()

        # Count outcomes
        proposals = data if isinstance(data, list) else data.get("items", [])
        total = len(proposals)
        approved = sum(
            1 for p in proposals
            if p.get("state", {}).get("name", "").lower() in ("approved", "confirmed", "executed")
        )

        return {
            "prior_total": total,
            "prior_approved": approved,
            "approval_rate": round(approved / total, 4) if total > 0 else 0.0,
        }
    except requests.RequestException as e:
        logger.debug("Could not fetch proposer history for %s: %s", address, e)
        return {"prior_total": 0, "prior_approved": 0, "approval_rate": 0.0}


def determine_risk_label(proposal):
    """
    Determine whether a proposal should be labelled high-risk.

    A proposal is considered high-risk if it was rejected, timed out,
    or was cancelled — these are the outcomes we want the model
    to learn to predict.
    """
    status = proposal.get("status", "").lower()

    high_risk_statuses = {
        "rejected",
        "timedout",
        "cancelled",
        "killed",
        "timeouted",
    }

    return 1 if status in high_risk_statuses else 0


def extract_dot_amount(proposal):
    """
    Extract the DOT amount requested from proposal data.

    Handles various formats used by Polkassembly to represent
    the requested treasury amount.
    """
    # Try direct amount field
    requested = proposal.get("requested_amount") or proposal.get("requestedAmount")
    if requested:
        try:
            # Convert from Planck to DOT (10 decimal places for Polkadot)
            return float(requested) / 1e10
        except (ValueError, TypeError):
            pass

    # Try from beneficiaries
    beneficiaries = proposal.get("beneficiaries", [])
    if beneficiaries:
        total = 0.0
        for b in beneficiaries:
            amount = b.get("amount", 0)
            try:
                total += float(amount) / 1e10
            except (ValueError, TypeError):
                continue
        if total > 0:
            return total

    return 0.0


def extract_track_id(proposal):
    """
    Extract the governance track identifier.

    OpenGov tracks: 0=root, 1=whitelisted_caller, 10=staking_admin,
    11=treasurer, 12=lease_admin, 13=fellowship_admin,
    14=general_admin, 15=auction_admin, 20=referendum_canceller,
    21=referendum_killer, 30=small_tipper, 31=big_tipper,
    32=small_spender, 33=medium_spender, 34=big_spender.
    """
    track = proposal.get("track_no") or proposal.get("track_number", -1)
    try:
        return int(track)
    except (ValueError, TypeError):
        return -1


def compute_wallet_age(proposal):
    """
    Approximate wallet age in blocks from the submission timestamp.

    Uses a heuristic based on the proposal's creation time.
    In production, this would come from the governance precompile,
    but for training data we estimate from available metadata.
    """
    created = proposal.get("created_at") or proposal.get("createdAt")
    if not created:
        return 100000  # Default to a reasonably old wallet

    try:
        # Parse the timestamp
        if isinstance(created, str):
            # Handle ISO format
            dt = datetime.fromisoformat(created.replace("Z", "+00:00"))
        else:
            dt = datetime.fromtimestamp(created, tz=timezone.utc)

        # Polkadot block time is roughly 6 seconds
        # Estimate blocks from the network genesis (roughly May 2020)
        genesis_approx = datetime(2020, 5, 26, tzinfo=timezone.utc)
        seconds_since_genesis = (dt - genesis_approx).total_seconds()
        blocks_at_creation = max(0, int(seconds_since_genesis / 6))

        # Wallet age is a fraction of blocks_at_creation
        # (heuristic: first activity is typically some blocks before proposing)
        return max(1000, blocks_at_creation)

    except (ValueError, TypeError, OverflowError):
        return 100000


def compute_days_since_last(proposals_by_proposer, current_proposal):
    """
    Calculate days since the proposer's previous proposal.

    This is the burst detection feature — if a proposer submits
    multiple proposals in rapid succession, it raises a flag.
    """
    proposer = current_proposal.get("proposer") or current_proposal.get("proposer_address", "")
    if not proposer or proposer not in proposals_by_proposer:
        return 365  # Default: no prior proposal, effectively no burst

    previous = proposals_by_proposer[proposer]
    if not previous:
        return 365

    current_time = current_proposal.get("created_at") or current_proposal.get("createdAt", "")
    try:
        if isinstance(current_time, str):
            current_dt = datetime.fromisoformat(current_time.replace("Z", "+00:00"))
        else:
            current_dt = datetime.fromtimestamp(current_time, tz=timezone.utc)

        # Find the most recent previous proposal
        min_days = 365
        for prev in previous:
            prev_time = prev.get("created_at") or prev.get("createdAt", "")
            if isinstance(prev_time, str):
                prev_dt = datetime.fromisoformat(prev_time.replace("Z", "+00:00"))
            else:
                prev_dt = datetime.fromtimestamp(prev_time, tz=timezone.utc)

            days_diff = abs((current_dt - prev_dt).days)
            if 0 < days_diff < min_days:
                min_days = days_diff

        return min_days

    except (ValueError, TypeError):
        return 365


def scrape_proposals(limit=250):
    """
    Main scraping function — collects proposal data from Polkassembly
    and enriches it with proposer history from Subsquare.

    Parameters
    ----------
    limit : int
        Maximum number of proposals to scrape.

    Returns
    -------
    list[dict]
        List of feature dictionaries ready for CSV export.
    """
    logger.info("Starting Fenrir data scrape — target: %d proposals", limit)

    all_proposals = []
    page = 1
    per_page = 50

    # Step 1: Collect raw proposal listings
    while len(all_proposals) < limit:
        logger.info("Fetching page %d...", page)
        posts = fetch_referenda_list(page=page, limit=per_page)

        if not posts:
            logger.info("No more proposals found at page %d — stopping.", page)
            break

        all_proposals.extend(posts)
        page += 1
        time.sleep(REQUEST_DELAY_SECONDS)

    all_proposals = all_proposals[:limit]
    logger.info("Collected %d proposal summaries", len(all_proposals))

    # Step 2: Compute the ecosystem average DOT request
    dot_amounts = []
    for p in all_proposals:
        amount = extract_dot_amount(p)
        if amount > 0:
            dot_amounts.append(amount)

    avg_dot = sum(dot_amounts) / len(dot_amounts) if dot_amounts else 5000.0
    logger.info("Ecosystem average DOT request: %.2f DOT", avg_dot)

    # Step 3: Track proposals by proposer for burst detection
    proposals_by_proposer = {}
    for p in all_proposals:
        proposer = p.get("proposer") or p.get("proposer_address", "unknown")
        if proposer not in proposals_by_proposer:
            proposals_by_proposer[proposer] = []
        proposals_by_proposer[proposer].append(p)

    # Step 4: Enrich each proposal with full features
    results = []
    proposer_cache = {}  # Cache proposer history lookups

    for i, proposal in enumerate(all_proposals):
        ref_index = proposal.get("post_id") or proposal.get("id", i)
        proposer = proposal.get("proposer") or proposal.get("proposer_address", "unknown")
        dot_requested = extract_dot_amount(proposal)
        track_id = extract_track_id(proposal)
        wallet_age = compute_wallet_age(proposal)
        days_since_last = compute_days_since_last(proposals_by_proposer, proposal)

        # Fetch proposer history (cached)
        if proposer not in proposer_cache and proposer != "unknown":
            proposer_cache[proposer] = fetch_proposer_history(proposer)
            time.sleep(REQUEST_DELAY_SECONDS)

        history = proposer_cache.get(proposer, {
            "prior_total": 0,
            "prior_approved": 0,
            "approval_rate": 0.0,
        })

        # Compute DOT ratio
        dot_ratio = round(dot_requested / avg_dot, 4) if avg_dot > 0 else 1.0

        # Determine the risk label
        risk_label = determine_risk_label(proposal)

        row = {
            "ref_index": ref_index,
            "proposer": proposer,
            "wallet_age_blocks": wallet_age,
            "dot_requested": round(dot_requested, 4),
            "dot_ratio_to_avg": dot_ratio,
            "prior_approved": history["prior_approved"],
            "prior_total": history["prior_total"],
            "approval_rate": history["approval_rate"],
            "track_id": track_id,
            "days_since_last_prop": days_since_last,
            "status": proposal.get("status", "unknown"),
            "high_risk": risk_label,
        }

        results.append(row)

        if (i + 1) % 25 == 0:
            logger.info("Processed %d / %d proposals", i + 1, len(all_proposals))

    logger.info("Scraping complete — %d proposals processed", len(results))
    return results


def save_to_csv(data, output_path):
    """
    Write the collected proposal data to a CSV file.

    Creates the output directory if it doesn't exist.
    """
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    with open(output_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=CSV_HEADERS)
        writer.writeheader()
        writer.writerows(data)

    logger.info("Saved %d rows to %s", len(data), output_path)


def main():
    """Entry point for the Fenrir data scraper."""
    parser = argparse.ArgumentParser(
        description="Fenrir — Scrape historical OpenGov proposals for ML training"
    )
    parser.add_argument(
        "--output",
        type=str,
        default="data/proposals.csv",
        help="Output CSV file path (default: data/proposals.csv)",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=250,
        help="Maximum number of proposals to scrape (default: 250)",
    )

    args = parser.parse_args()
    data = scrape_proposals(limit=args.limit)
    save_to_csv(data, args.output)


if __name__ == "__main__":
    main()
