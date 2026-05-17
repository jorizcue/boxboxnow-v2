# Guard: don't delete the last payment method with a renewing subscription — Design

**Date:** 2026-05-17 · **Status:** approved. Payment-critical. No DB migration.

## Bug
`DELETE /api/stripe/payment-methods/{pm_id}` (`stripe_routes.py:1293-1309`) only checks PM ownership, then `s.PaymentMethod.detach(pm_id)`. No check for last/only card, default card, or an active renewing subscription. Stripe does not block the detach. Result: a user deletes their only card with a recurring Stripe subscription → next renewal has no payment method → invoice fails → `past_due` → dunning → `canceled`/`unpaid` → access revoked by the webhook handlers. Silent time-bomb. Confirmed.

## Predicate — "subscription that will auto-charge again" (renewing)
A user has a renewing **Stripe recurring** subscription iff a `Subscription` row exists with:
`stripe_subscription_id IS NOT NULL` AND `status IN ('active','trialing','past_due')` AND `cancel_at_period_end` is not true (treat NULL as False).
Excluded (deleting the last card is harmless → allow): the internal free trial (created by `start_trial`, has **no** `stripe_subscription_id`), one-time/event purchases (`stripe_subscription_id` NULL, e.g. `plan_type='event'`), `canceled`/`expired`, and `cancel_at_period_end=True` (won't renew). `is_internal`/no-customer users naturally have no such row.

## Backend (`stripe_routes.py` `delete_payment_method`) — authoritative
Add `db: AsyncSession = Depends(get_db)` to the signature (it currently has none). Logic:
1. Unchanged: `if not user.stripe_customer_id: 400`; `pm = s.PaymentMethod.retrieve(pm_id)`; `if pm.customer != user.stripe_customer_id: 403` (ownership — keep exactly).
2. `methods = s.PaymentMethod.list(customer=user.stripe_customer_id, type="card")`; `remaining = [m for m in methods.data if m.id != pm_id]`.
3. **If `len(remaining) == 0`** (this is the last card): run the renewing-subscription query above. If a renewing sub exists → `raise HTTPException(status_code=409, detail="payment_method_required")` and DO NOT detach.
4. Else (allowed to proceed) — **preserve a usable default**: `customer = s.Customer.retrieve(user.stripe_customer_id)`; if `customer.invoice_settings and customer.invoice_settings.default_payment_method == pm_id` AND `remaining` is non-empty → `s.Customer.modify(user.stripe_customer_id, invoice_settings={"default_payment_method": remaining[0].id})` BEFORE detaching, so a still-renewing-but-not-last scenario never leaves the subscription without a default.
5. `s.PaymentMethod.detach(pm_id)`; return `{"ok": True}`.
(Order matters: ownership → last-card guard → default-promotion → detach. No detach on the 409 path.)

## Frontend (`frontend/src/components/account/PaymentMethodsPanel.tsx`)
- `handleDelete` catch: detect HTTP 409 with detail `payment_method_required` (fetchApi surfaces FastAPI `detail` as the thrown `Error.message` — mirror how `EmbeddedCheckout.tsx` matches `email_not_verified`). On that → show `t("payment.cannotDeleteLast")` (clear, actionable: "No puedes eliminar tu único método de pago con una suscripción activa. Añade otra tarjeta antes."). Any other error → keep existing `t("payment.errorDelete")`.
- UX hint: when `methods.length === 1`, render a small inline note under the card list: `t("payment.lastMethodNote")` ("Para cambiar de tarjeta con una suscripción activa, añade la nueva antes de eliminar la actual."). Keep the delete button enabled (backend is authoritative; the precise rule depends on subscription state the panel doesn't load — the 409 is the safety net). Do NOT couple the panel to subscription APIs.
- i18n: add `payment.cannotDeleteLast` and `payment.lastMethodNote` to `frontend/src/lib/i18n.ts` in all 5 locales (es/en/it/de/fr), mirroring existing `payment.*` keys.

## Testing (backend pytest; httpx ASGITransport + `dependency_overrides` for `get_current_user`+`get_db`, monkeypatch `app.api.stripe_routes.get_stripe`)
Fake stripe object: `PaymentMethod.list(customer,type)` → `.data` list of objs with `.id`; `PaymentMethod.retrieve(id)` → obj with `.customer`; `PaymentMethod.detach(id)` → records calls; `Customer.retrieve(id)` → obj with `.invoice_settings.default_payment_method`; `Customer.modify(id, invoice_settings=...)` → records calls. Seed `Subscription` rows via `db_session`; stub user with `stripe_customer_id`.
Cases (assert detach called / NOT called + status + Customer.modify):
1. Last card + renewing recurring sub (`stripe_subscription_id` set, status `active`, `cancel_at_period_end` False) → **409 `payment_method_required`, detach NOT called**.
2. Last card + sub `cancel_at_period_end=True` → allowed (detach called).
3. Last card + only internal trial (no `stripe_subscription_id`) → allowed.
4. Last card + only one-time/event (`stripe_subscription_id` NULL, `plan_type='event'`) → allowed.
5. Last card + no subscription rows → allowed.
6. Non-last card + renewing sub → allowed (detach called); 409 NOT raised.
7. Deleting the default card while ≥1 other remains (allowed path) → `Customer.modify` called to set `remaining[0]` as default **before** detach; detach called.
8. PM ownership mismatch → 403 (unchanged), detach NOT called.
9. `cancel_at_period_end` NULL legacy row treated as not-cancelling → still blocks (case 1 variant with NULL).
Then full `pytest tests -q` green (no regression to the other stripe endpoints/tests).
Frontend: `tsc` + `npm run build` green.

## Scope / non-goals
`stripe_routes.py` `delete_payment_method` + new backend test + `PaymentMethodsPanel.tsx` + `i18n.ts`. No migration. Do NOT change `list_payment_methods`, `create_setup_intent`, `set_default_payment_method`, `cancel_subscription`, webhooks, or the checkout flow. Not implementing a full "replace-before-remove" wizard (the SetupIntent + set-default infra already lets users add a card first; the guard + clear message is sufficient). Default behavior unchanged for every non-last-card / non-renewing case.
