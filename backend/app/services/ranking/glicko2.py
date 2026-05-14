"""Glicko-2 implementation in pure Python (no SciPy / NumPy).

Reference: Glickman, M. E. (2012). "Example of the Glicko-2 system",
http://www.glicko.net/glicko/glicko2.pdf

Glicko-2 vs vanilla ELO:
  - Each player has THREE numbers, not one:
      rating   (μ)  — the skill estimate (default 1500).
      rd       (φ)  — rating deviation, the uncertainty (default 350).
      volatility (σ) — how erratic the player's results are (default 0.06).
  - A player with few matches has high RD ⇒ their rating moves a lot
    when they play. A player with many matches has low RD ⇒ rating is
    stable. This is exactly what we want for karting where most pilots
    have 1-4 sessions in our recordings — vanilla ELO would either
    massively overcorrect or, with a tiny K-factor, never converge.
  - Several opponents per "rating period" — fits naturally with a
    karting session where each driver runs against N-1 others
    simultaneously.

The math operates in an internal scale (μ = (rating-1500)/173.7178,
φ = rd/173.7178) and converts back at the end. Implementation kept
deliberately small (~80 lines of actual code) and tested against the
worked example in Glickman's paper.
"""
from __future__ import annotations

import math
from dataclasses import dataclass

# Glicko-2 constants
SCALE = 173.7178           # σ rating⇄internal scaler
TAU = 0.5                  # system constant; bigger ⇒ ratings move faster
EPSILON = 1e-6             # convergence tolerance for volatility iteration

DEFAULT_RATING = 1500.0
DEFAULT_RD = 350.0
DEFAULT_VOLATILITY = 0.06


@dataclass
class Glicko2State:
    """One player's full Glicko-2 state."""
    rating: float = DEFAULT_RATING
    rd: float = DEFAULT_RD
    volatility: float = DEFAULT_VOLATILITY

    @property
    def mu(self) -> float:
        return (self.rating - DEFAULT_RATING) / SCALE

    @property
    def phi(self) -> float:
        return self.rd / SCALE


def _g(phi: float) -> float:
    return 1.0 / math.sqrt(1.0 + (3.0 * phi * phi) / (math.pi * math.pi))


def _E(mu: float, mu_j: float, phi_j: float) -> float:
    return 1.0 / (1.0 + math.exp(-_g(phi_j) * (mu - mu_j)))


def _new_volatility(sigma: float, phi: float, v: float, delta: float) -> float:
    """Solve for the new volatility σ' via the iterative procedure in
    section 5.4 of the paper (Illinois method on f(x))."""
    a = math.log(sigma * sigma)
    tau2 = TAU * TAU

    def f(x: float) -> float:
        ex = math.exp(x)
        denom = 2.0 * (phi * phi + v + ex) ** 2
        return (ex * (delta * delta - phi * phi - v - ex)) / denom - (x - a) / tau2

    A = a
    if delta * delta > phi * phi + v:
        B = math.log(delta * delta - phi * phi - v)
    else:
        k = 1
        while f(a - k * TAU) < 0:
            k += 1
        B = a - k * TAU

    fA = f(A)
    fB = f(B)
    while abs(B - A) > EPSILON:
        C = A + (A - B) * fA / (fB - fA)
        fC = f(C)
        if fC * fB <= 0:
            A = B
            fA = fB
        else:
            fA /= 2.0
        B = C
        fB = fC
    return math.exp(A / 2.0)


def update(
    state: Glicko2State,
    opponents: list[tuple[Glicko2State, float]],
) -> Glicko2State:
    """Apply one Glicko-2 rating period update to `state`.

    `opponents` is a list of (opponent_state, score) tuples where
    `score ∈ {1.0 win, 0.5 draw, 0.0 loss}`. The opponent states are
    read PRE-update (Glicko-2 is symmetric: each player's pre-period
    state is what their opponents see this period).

    Returns a new `Glicko2State` — does not mutate the input.
    """
    # Edge case: no games this period → just inflate RD per the
    # "pre-period" formula in section 5.6.
    if not opponents:
        phi_new = math.sqrt(state.phi * state.phi + state.volatility * state.volatility)
        return Glicko2State(
            rating=state.rating,
            rd=min(phi_new * SCALE, DEFAULT_RD),
            volatility=state.volatility,
        )

    mu = state.mu
    phi = state.phi
    sigma = state.volatility

    # Step 3: compute v (variance of player's rating)
    v_inv = 0.0
    for opp, _ in opponents:
        g_j = _g(opp.phi)
        E_j = _E(mu, opp.mu, opp.phi)
        v_inv += g_j * g_j * E_j * (1.0 - E_j)
    v = 1.0 / v_inv if v_inv > 0 else float("inf")

    # Step 4: compute delta
    delta_sum = 0.0
    for opp, s in opponents:
        g_j = _g(opp.phi)
        E_j = _E(mu, opp.mu, opp.phi)
        delta_sum += g_j * (s - E_j)
    delta = v * delta_sum

    # Step 5: new volatility
    sigma_new = _new_volatility(sigma, phi, v, delta)

    # Step 6: pre-rating-period RD (inflate by volatility)
    phi_star = math.sqrt(phi * phi + sigma_new * sigma_new)

    # Step 7: new rating + RD
    phi_new = 1.0 / math.sqrt(1.0 / (phi_star * phi_star) + 1.0 / v)
    mu_new = mu + phi_new * phi_new * delta_sum

    return Glicko2State(
        rating=mu_new * SCALE + DEFAULT_RATING,
        rd=min(phi_new * SCALE, DEFAULT_RD),
        volatility=sigma_new,
    )
