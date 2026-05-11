"""Pit-open/close feasibility check.

Given the current race state and configuration, decides whether pitting *now*
still allows the race to finish with every constraint satisfied:

  * each stint length in [min_stint_min, max_stint_min]
  * minimum number of pits met
  * each driver accumulates at least `min_driver_time_min`

When NO assignment of drivers to future stints exists that satisfies all of
the above, the pit MUST stay closed even if `realMaxStint` would otherwise
allow it — pitting now would lock the race into an unrecoverable state.

The algorithm runs in O(K · N) where K = drivers, N = future stints, so it
scales fine for 30 h / 35 pits / 5 drivers (175 ops, sub-millisecond).

Output shape: PitStatus dataclass — serialized into the WS snapshot at
`data.pitStatus` and consumed by every client (web, iPad dashboard, iOS /
Android driver apps).
"""
from __future__ import annotations

import math
from dataclasses import dataclass, asdict
from typing import Iterable


# ───────────────────────── Public types ─────────────────────────

@dataclass
class DriverTimeInfo:
    """Per-driver accumulated/remaining time, surfaced to the UI for
    tooltips ("Matías needs 9 more min")."""
    name: str
    accumulated_ms: int
    remaining_ms: int   # max(0, min_driver_time_ms - accumulated_ms)


@dataclass
class PitStatus:
    """Result of the feasibility check. Serialized as the `pitStatus`
    field of the WS snapshot / analytics / fifo_update messages."""
    is_open: bool
    # Close-reason enum (None when is_open == True):
    #   regulation_start     — within pit_closed_start_min window
    #   regulation_end       — within pit_closed_end_min window
    #   stint_too_short      — pitting now would force future stints > max
    #   stint_too_long       — pitting now would force future stints < min
    #   driver_min_time      — some driver wouldn't reach min_driver_time_min
    #   no_active_kart       — our kart isn't configured / not racing
    #   not_running          — race not started / already finished
    close_reason: str | None = None
    # When close_reason == "driver_min_time", which driver is the blocker
    # (the one with the largest remaining time). Drives the UI badge text:
    # "PIT CERRADO · Matías necesita 9 min más".
    blocking_driver: str | None = None
    blocking_driver_remaining_ms: int = 0
    # Predicted countdown (clock) value at which the pit will open next.
    # Computed by stepping forward in 10-second slices and rerunning the
    # check; None when the gate is already open or no future moment is
    # feasible. Used by the "Pit abre en HH:MM:SS" card.
    next_open_countdown_ms: int | None = None
    # Per-driver detail surfaced for the UI tooltip / driver-detail panel.
    drivers: list[DriverTimeInfo] = None  # type: ignore[assignment]

    def to_dict(self) -> dict:
        d = asdict(self)
        d["drivers"] = [asdict(x) for x in (self.drivers or [])]
        return d


# ───────────────────────── Core feasibility ─────────────────────────

def _driver_times_for_kart(
    driver_total_ms: dict[str, int],
    stint_elapsed_ms: int,
    current_driver: str | None,
    team_drivers_count: int,
) -> list[tuple[str, int]]:
    """Build the (driver_name, accumulated_ms) list used by the feasibility
    check. Includes the current driver's in-progress stint time (which
    isn't yet committed to driver_total_ms — that happens on pit-in).

    When the configured `team_drivers_count` is greater than the number of
    drivers we've actually seen via Apex, we pad with anonymous "Driver 2",
    "Driver 3"… entries with 0 ms accumulated. This is what makes the gate
    fire from the very first stint instead of waiting for a driver change
    to reveal the team composition.
    """
    # Start with what Apex has given us. The dict is name -> committed ms.
    times: dict[str, int] = dict(driver_total_ms or {})
    if current_driver:
        # Add current stint's elapsed ms to the active driver. The dict's
        # value reflects only what has been *committed* by pit-ins, so the
        # active driver's running stint must be added on top.
        times[current_driver] = times.get(current_driver, 0) + max(0, stint_elapsed_ms)

    pairs = list(times.items())

    # Pad to team_drivers_count if the strategist configured it and we
    # haven't seen that many drivers yet. The padded "ghost" drivers have
    # 0 ms accumulated, so they're treated as drivers that still need
    # their full minimum_driver_time_min.
    if team_drivers_count > len(pairs):
        for i in range(team_drivers_count - len(pairs)):
            pairs.append((f"Driver {len(pairs) + 1}", 0))

    return pairs


def _is_driver_min_feasible(
    drivers: list[tuple[str, int]],
    n_future_stints: int,
    drive_remaining_ms: int,
    min_stint_ms: int,
    max_stint_ms: int,
    min_driver_time_ms: int,
) -> tuple[bool, str | None, int]:
    """O(K · N) greedy feasibility check.

    Returns (feasible, blocking_driver_name, blocking_remaining_ms). When
    feasible is True, the blocking-driver fields are ("", 0). When False,
    they point to the driver with the largest unmet remaining time — the
    one we'll surface in the UI badge.
    """
    K = len(drivers)
    if K == 0:
        # No drivers known and no constraint requested: trivially feasible.
        return True, None, 0

    if n_future_stints <= 0:
        # No future stints: every driver must already be at minimum.
        worst_name, worst_rem = None, 0
        for name, acc in drivers:
            rem = max(0, min_driver_time_ms - acc)
            if rem > worst_rem:
                worst_name, worst_rem = name, rem
        return (worst_rem == 0), worst_name, worst_rem

    # Aggregate-length bounds: each stint must be in [min, max], summed
    # over n_future_stints must equal drive_remaining_ms.
    if drive_remaining_ms < min_stint_ms * n_future_stints:
        # Pit too late: future avg stint < min_stint. Surface the driver
        # with the largest unmet need as the blocker so the UI badge can
        # render a meaningful explanation, even though this isn't a
        # driver-min violation per se.
        worst_name, worst_rem = max(
            ((n, max(0, min_driver_time_ms - a)) for n, a in drivers),
            key=lambda x: x[1],
            default=(None, 0),
        )
        return False, worst_name, worst_rem
    if drive_remaining_ms > max_stint_ms * n_future_stints:
        # Pit too early: future avg stint > max. Same handling.
        worst_name, worst_rem = max(
            ((n, max(0, min_driver_time_ms - a)) for n, a in drivers),
            key=lambda x: x[1],
            default=(None, 0),
        )
        return False, worst_name, worst_rem

    # Per-driver "remaining time" required to hit min_driver_time.
    remaining = [max(0, min_driver_time_ms - acc) for _, acc in drivers]

    # Step 1: minimum stints required per driver. A driver who already has
    # remaining == 0 doesn't need a stint at all (0 stints suffice). A
    # driver with remaining > 0 needs at least ⌈remaining / max_stint⌉
    # stints because each stint is capped at max_stint.
    x = [
        (math.ceil(r / max_stint_ms) if r > 0 else 0)
        for r in remaining
    ]
    total_x = sum(x)
    if total_x > n_future_stints:
        # Drivers collectively need more stints than the race has left.
        worst_idx = max(range(K), key=lambda i: remaining[i])
        return False, drivers[worst_idx][0], remaining[worst_idx]

    # Step 2: distribute slack stints (n_future - sum(x)) to the driver
    # whose lower-bound increases the LEAST. The marginal cost of adding
    # one stint to driver k is:
    #   new_lower − old_lower
    #   where lower(k) = max(x_k · min_stint, remaining_k)
    # That cost is 0 while (x_k+1) · min_stint ≤ remaining_k (the remaining
    # constraint is still binding), and min_stint once x_k · min_stint
    # exceeds remaining_k. Greedy is optimal for non-negative costs.
    slack = n_future_stints - total_x
    for _ in range(slack):
        best_k = 0
        best_cost = float("inf")
        for k in range(K):
            old_lower = max(x[k] * min_stint_ms, remaining[k])
            new_lower = max((x[k] + 1) * min_stint_ms, remaining[k])
            cost = new_lower - old_lower
            if cost < best_cost:
                best_cost = cost
                best_k = k
        x[best_k] += 1

    # Step 3: with the slack distributed, check the aggregate lower bound
    # fits within drive_remaining. If it does, the LP has a feasible (y_k)
    # for this x; we don't need to compute the y_k explicitly.
    total_lower = sum(max(x[k] * min_stint_ms, remaining[k]) for k in range(K))
    total_upper = n_future_stints * max_stint_ms

    if total_lower <= drive_remaining_ms <= total_upper:
        return True, None, 0

    # Distribution exists but doesn't fit. Report the driver with most
    # unmet need as the blocker.
    worst_idx = max(range(K), key=lambda i: remaining[i])
    return False, drivers[worst_idx][0], remaining[worst_idx]


# ───────────────────────── Public entry point ─────────────────────────

def compute_pit_status(state) -> PitStatus:
    """Compute the pit gate for the user's currently-tracked kart.

    Reads everything from `RaceStateManager`. Returns a `PitStatus` ready
    to serialize into the WS broadcast. Pure function — no side effects.
    """
    # Race not running → don't expose a gate decision.
    if not state.race_started or state.race_finished:
        return PitStatus(is_open=True, close_reason="not_running")

    our_kart_n = state.our_kart_number or 0
    if our_kart_n <= 0:
        # No kart configured: treat as open (the gate is meaningless).
        return PitStatus(is_open=True, close_reason="no_active_kart")

    our_kart = next(
        (k for k in state.karts.values() if k.kart_number == our_kart_n),
        None,
    )
    if our_kart is None:
        return PitStatus(is_open=True, close_reason="no_active_kart")

    # Regulation windows (start / end of race). Computed against the
    # countdown clock so they match the existing front-end formulas.
    duration_ms = (
        getattr(state, "_first_countdown_ms", 0)
        or state.duration_min * 60 * 1000
    )
    countdown_ms = state.countdown_ms
    elapsed_min = (duration_ms - countdown_ms) / 60000 if duration_ms > 0 else 0
    remaining_min = countdown_ms / 60000

    if state.pit_closed_start_min > 0 and elapsed_min < state.pit_closed_start_min:
        return PitStatus(is_open=False, close_reason="regulation_start")
    if state.pit_closed_end_min > 0 and remaining_min < state.pit_closed_end_min:
        return PitStatus(is_open=False, close_reason="regulation_end")

    # Pit-status sanity. If the kart is already in pit, the gate question
    # is moot — let the client decide what to display.
    if getattr(our_kart, "pit_status", "racing") != "racing":
        return PitStatus(is_open=True, close_reason=None)

    # Stint-length feasibility (existing logic). pendingPits counts the
    # current/about-to-happen pit as part of the remaining quota.
    min_pits = state.min_pits
    pending_pits = max(0, min_pits - our_kart.pit_count)
    pending_pits_after_this = max(0, pending_pits - 1)
    n_future_stints = pending_pits_after_this + 1

    pit_time_s = state.pit_time_s or 0
    min_stint_s = state.min_stint_min * 60
    max_stint_s = state.max_stint_min * 60

    stint_start_countdown_ms = getattr(our_kart, "stint_start_countdown_ms", 0)
    if stint_start_countdown_ms <= 0:
        stint_start_countdown_ms = duration_ms or countdown_ms

    t_start_s = stint_start_countdown_ms / 1000.0
    stint_sec = max(0.0, t_start_s - countdown_ms / 1000.0)

    # Reserve for the part of the race AFTER the current pit:
    #   (pending_pits_after_this + 1) stints + pending_pits_after_this pits
    min_reserve_s = (pending_pits_after_this + 1) * min_stint_s + pending_pits_after_this * pit_time_s
    max_reserve_s = (pending_pits_after_this + 1) * max_stint_s + pending_pits_after_this * pit_time_s

    real_min_stint_s = max(min_stint_s, t_start_s - pit_time_s - max_reserve_s)
    real_max_stint_s = min(max_stint_s, t_start_s - pit_time_s - min_reserve_s)

    if stint_sec < real_min_stint_s:
        # Pitting now would force every future stint to be longer than
        # max_stint — infeasible. Same condition the web "tooEarly" flag
        # captures, formalized here.
        return PitStatus(is_open=False, close_reason="stint_too_short")
    if stint_sec > real_max_stint_s + 1:
        # We've already overrun. Symmetric case: pitting now would leave
        # too much time for the remaining stints at min length. Surface
        # it explicitly so the UI knows to switch to "URGENT — pit now".
        # (Threshold +1s avoids flapping on rounding.)
        return PitStatus(is_open=False, close_reason="stint_too_long")

    # Driver-minimum-time feasibility.
    min_driver_time_min = getattr(state, "min_driver_time_min", 0) or 0
    team_drivers_count = getattr(state, "team_drivers_count", 0) or 0
    drivers_pairs: list[tuple[str, int]] = []
    drivers_info_list: list[DriverTimeInfo] = []

    if min_driver_time_min > 0:
        min_driver_time_ms = min_driver_time_min * 60 * 1000

        # Pull each driver's accumulated time (including in-progress stint).
        stint_elapsed_ms = getattr(our_kart, "stint_elapsed_ms", 0)
        current_driver = getattr(our_kart, "driver_name", "") or None
        drivers_pairs = _driver_times_for_kart(
            getattr(our_kart, "driver_total_ms", {}),
            stint_elapsed_ms,
            current_driver,
            team_drivers_count,
        )

        drivers_info_list = [
            DriverTimeInfo(
                name=name,
                accumulated_ms=int(acc),
                remaining_ms=int(max(0, min_driver_time_ms - acc)),
            )
            for name, acc in drivers_pairs
        ]

        # Drive time remaining AFTER current pit, summed across future stints.
        drive_remaining_s = (countdown_ms / 1000.0) - pit_time_s * (pending_pits_after_this + 1)
        if drive_remaining_s < 0:
            drive_remaining_s = 0

        feasible, blocker, blocker_rem = _is_driver_min_feasible(
            drivers_pairs,
            n_future_stints,
            int(drive_remaining_s * 1000),
            int(min_stint_s * 1000),
            int(max_stint_s * 1000),
            min_driver_time_ms,
        )

        if not feasible:
            # Predict when the gate will open next (best-effort): step the
            # countdown forward in 10 s slices and re-check. Stop at race
            # end or after 1 h of simulated future.
            next_open_ms = _predict_next_open_countdown_ms(
                state, our_kart,
            )
            return PitStatus(
                is_open=False,
                close_reason="driver_min_time",
                blocking_driver=blocker,
                blocking_driver_remaining_ms=int(blocker_rem),
                next_open_countdown_ms=next_open_ms,
                drivers=drivers_info_list,
            )

    return PitStatus(
        is_open=True,
        close_reason=None,
        drivers=drivers_info_list,
    )


# ───────────────────────── Predictive helper ─────────────────────────

def _predict_next_open_countdown_ms(state, our_kart) -> int | None:
    """Find the next clock value at which the gate will open by stepping
    forward in 10 s slices. Capped at 60 minutes of simulated future so
    a permanently-infeasible state doesn't hang the loop. Returns None
    when no feasible moment is reachable.
    """
    countdown_ms = state.countdown_ms
    if countdown_ms <= 0:
        return None

    duration_ms = (
        getattr(state, "_first_countdown_ms", 0)
        or state.duration_min * 60 * 1000
    )
    pit_time_s = state.pit_time_s or 0
    min_stint_s = state.min_stint_min * 60
    max_stint_s = state.max_stint_min * 60
    min_driver_time_min = getattr(state, "min_driver_time_min", 0) or 0
    if min_driver_time_min <= 0:
        return None
    min_driver_time_ms = min_driver_time_min * 60 * 1000
    team_drivers_count = getattr(state, "team_drivers_count", 0) or 0

    stint_start_countdown_ms = getattr(our_kart, "stint_start_countdown_ms", 0)
    if stint_start_countdown_ms <= 0:
        return None
    pending_pits = max(0, state.min_pits - our_kart.pit_count)
    pending_pits_after_this = max(0, pending_pits - 1)
    n_future_stints = pending_pits_after_this + 1

    current_driver = getattr(our_kart, "driver_name", "") or None
    committed_total_ms = dict(getattr(our_kart, "driver_total_ms", {}))
    committed_now = committed_total_ms.get(current_driver, 0) if current_driver else 0
    stint_elapsed_ms_now = getattr(our_kart, "stint_elapsed_ms", 0)

    step_ms = 10_000  # 10 s slices
    max_horizon_min = 60
    max_steps = (max_horizon_min * 60 * 1000) // step_ms

    for step in range(1, int(max_steps) + 1):
        delta_ms = step * step_ms
        future_countdown_ms = countdown_ms - delta_ms
        if future_countdown_ms <= 0:
            return None

        # Project stint elapsed forward — the current driver keeps driving.
        future_stint_elapsed = stint_elapsed_ms_now + delta_ms

        # Project the driver_total_ms snapshot forward.
        future_committed = dict(committed_total_ms)
        if current_driver:
            future_committed[current_driver] = committed_now  # committed stays put until pit-in

        drivers_pairs = _driver_times_for_kart(
            future_committed,
            future_stint_elapsed,
            current_driver,
            team_drivers_count,
        )

        # Check stint-length-window too — they shift as the clock advances.
        t_start_s = stint_start_countdown_ms / 1000.0
        future_stint_sec = max(0.0, t_start_s - future_countdown_ms / 1000.0)
        if future_stint_sec > max_stint_s:
            # We'd overshoot real_max_stint by then — no point looking
            # further, the gate will be in "stint_too_long" (URGENT) not
            # "open".
            return None

        max_reserve_s = (pending_pits_after_this + 1) * max_stint_s + pending_pits_after_this * pit_time_s
        min_reserve_s = (pending_pits_after_this + 1) * min_stint_s + pending_pits_after_this * pit_time_s
        real_min_stint_s = max(min_stint_s, t_start_s - pit_time_s - max_reserve_s)
        real_max_stint_s = min(max_stint_s, t_start_s - pit_time_s - min_reserve_s)

        if future_stint_sec < real_min_stint_s:
            continue  # stint not long enough yet
        if future_stint_sec > real_max_stint_s + 1:
            return None  # past the window for ever

        drive_remaining_s = (future_countdown_ms / 1000.0) - pit_time_s * (pending_pits_after_this + 1)
        if drive_remaining_s < 0:
            return None

        feasible, _, _ = _is_driver_min_feasible(
            drivers_pairs,
            n_future_stints,
            int(drive_remaining_s * 1000),
            int(min_stint_s * 1000),
            int(max_stint_s * 1000),
            min_driver_time_ms,
        )
        if feasible:
            return int(future_countdown_ms)

    return None
