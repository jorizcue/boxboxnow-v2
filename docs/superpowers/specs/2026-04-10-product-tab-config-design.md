# Dynamic Product/Tab Configuration

**Date:** 2026-04-10
**Status:** Approved

## Problem

Plan capabilities (tabs, max_devices) are hardcoded in `PLAN_CONFIG` inside `stripe_routes.py`. Adding or modifying a plan requires a code deploy. The pricing page in the frontend is also hardcoded. Admins cannot control what each Stripe product grants without developer intervention.

## Solution

Replace the hardcoded `PLAN_CONFIG` dict with a database-backed `product_tab_config` table that maps each Stripe product to its capabilities. Provide an admin UI to configure these mappings. Make the landing page pricing cards dynamic by reading from a public API endpoint.

## Data Model

### New Table: `product_tab_config`

| Column | Type | Description |
|--------|------|-------------|
| id | Integer PK | Auto-increment |
| stripe_product_id | String(255), unique, indexed | Stripe product ID (e.g., `prod_xxx`) |
| plan_type | String(50) | `basic_monthly`, `basic_annual`, `pro_monthly`, `pro_annual`, `event` |
| tabs | Text (JSON) | JSON array of tab slugs granted by this product |
| max_devices | Integer | Max concurrent devices for this product |
| display_name | String(100) | Name shown on pricing page (e.g., "Plan Basic") |
| description | Text, nullable | Short description for pricing card |
| features | Text (JSON), nullable | JSON array of feature strings for pricing card bullets |
| price_monthly | Float, nullable | Monthly price in EUR for display |
| price_annual | Float, nullable | Annual price in EUR for display |
| is_popular | Boolean, default false | Highlight badge on pricing card |
| is_visible | Boolean, default true | Whether to show on public pricing page |
| sort_order | Integer, default 0 | Display order on pricing page |

### New AppSettings Keys

| Key | Default | Description |
|-----|---------|-------------|
| `default_tabs` | `[]` (JSON array) | Tabs granted to newly registered users (no purchase) |
| `default_max_devices` | `1` | Max devices for new users |
| `trial_tabs` | `["race","pit","live","config","adjusted","adjusted-beta","driver","driver-config"]` | Tabs granted during trial period |
| `trial_max_devices` | `2` | Max devices during trial |

## Backend

### New Endpoints

#### Admin Product Config CRUD

All require `is_admin` authentication.

- **`GET /api/admin/product-config`** — List all product configs
- **`POST /api/admin/product-config`** — Create a new product config
- **`PUT /api/admin/product-config/{id}`** — Update a product config
- **`DELETE /api/admin/product-config/{id}`** — Delete a product config
- **`GET /api/admin/stripe-products`** — List products from Stripe API (for the dropdown selector in admin UI)

#### Public Plans Endpoint

- **`GET /api/plans`** — Returns visible product configs for the pricing page. No auth required. Returns only `is_visible=true` records, sorted by `sort_order`. Response shape:

```json
[
  {
    "id": 1,
    "stripe_product_id": "prod_xxx",
    "plan_type": "basic_monthly",
    "display_name": "Plan Basic",
    "description": "Para equipos pequenos",
    "features": ["Estrategia en tiempo real", "Gestion de pit stops", ...],
    "price_monthly": 29.99,
    "price_annual": 299.99,
    "is_popular": false,
    "sort_order": 1
  },
  ...
]
```

Note: `tabs`, `max_devices`, and `stripe_product_id` are NOT exposed in the public endpoint. The frontend only needs display info and `plan_type` to construct checkout links.

#### Admin AppSettings Endpoints

Existing `GET/PUT /api/admin/settings` endpoints already handle `AppSetting` key-value pairs. The new keys (`default_tabs`, `default_max_devices`, `trial_tabs`, `trial_max_devices`) will use the same mechanism.

### Modified Logic

#### `_apply_plan_to_user(user_id, plan_type, db)` → `_apply_plan_to_user(user_id, stripe_product_id, db)`

Currently reads from `PLAN_CONFIG` dict. Will change to:

1. Query `product_tab_config` by `stripe_product_id`
2. If found, apply `tabs` and `max_devices` from the DB row
3. If not found, log a warning and skip (fail-safe: don't remove existing access)

The function signature changes from `plan_type` to `stripe_product_id` because the webhook payload contains the Stripe product ID, which maps directly to our config table.

#### Registration (auth_routes.py)

When creating a new user:
- Read `default_tabs` and `default_max_devices` from `AppSetting`
- Apply those as the user's initial tab access and max_devices
- If trial is active, read `trial_tabs` and `trial_max_devices` instead

#### Checkout Session Creation

Currently the frontend sends a `plan` name. This continues to work — the backend resolves the Stripe price ID from the product config. The checkout metadata includes `stripe_product_id` so the webhook can look up the config.

#### Webhook Handlers

`checkout.session.completed` and `invoice.paid` already extract the product/plan info. They will pass `stripe_product_id` (from subscription item or checkout metadata) to `_apply_plan_to_user`.

### Security Invariant

The frontend never sends `tabs`, `max_devices`, or `plan_type`. It only sends:
- `product_id` or `plan` (to identify what to buy)
- `billing` (`monthly` or `annual`)
- `circuit_id` (which circuit to access)

The backend resolves all capabilities from `product_tab_config` in the database. This prevents any client-side manipulation of access levels.

## Frontend

### Admin UI: `AdminPlatformPanel` Component

New component (or section within existing admin panel) with three collapsible sections:

#### 1. Registration Defaults
- **Default tabs**: Multi-select checkboxes for tabs granted to new users
- **Default max devices**: Number input

#### 2. Trial Configuration
- **Trial tabs**: Multi-select checkboxes for tabs granted during trial
- **Trial max devices**: Number input

#### 3. Products / Plans
- Table listing all configured products
- Each row shows: display_name, plan_type, tabs (as chips/badges), max_devices, visibility toggle
- "Add Product" button opens a form:
  - Stripe product dropdown (fetched from `GET /api/admin/stripe-products`)
  - Plan type selector (basic_monthly, basic_annual, pro_monthly, pro_annual, event)
  - Tab checkboxes
  - Max devices input
  - Display fields: name, description, features list, monthly price, annual price, is_popular, sort_order
- Edit/Delete actions per row

### Dynamic Pricing Page

`PricingToggle.tsx` currently has hardcoded plan data. Will change to:

1. Fetch plans from `GET /api/plans` on mount
2. Render pricing cards dynamically from the response
3. Monthly/annual toggle filters cards by showing the appropriate price
4. Each card's CTA button links to `/register?plan=${plan_type}`
5. Loading skeleton while fetching
6. Fallback to hardcoded defaults if the API call fails (graceful degradation)

Card structure remains the same visually — the data just comes from the API instead of constants.

## Migration Strategy

### Existing Data

On first deploy, the `product_tab_config` table will be empty. The system needs seed data:

1. **Database migration** (`init_db`): Create the `product_tab_config` table
2. **Seed script or admin action**: Admin manually configures products through the new UI, mapping existing Stripe products to their tab/device configs
3. **Fallback**: Until products are configured, `_apply_plan_to_user` falls back to the current `PLAN_CONFIG` dict. This dict remains in code as a fallback but is only used when no DB config exists for a given product. This ensures zero downtime during the transition.

### AppSettings Defaults

If the `default_tabs`, `trial_tabs`, etc. keys don't exist in `app_settings`, the code falls back to sensible hardcoded defaults (matching current behavior).

## Files to Modify

| File | Change |
|------|--------|
| `backend/app/models/schemas.py` | Add `ProductTabConfig` model |
| `backend/app/models/pydantic_models.py` | Add Pydantic models for product config CRUD |
| `backend/app/models/database.py` | Add table creation in `init_db` |
| `backend/app/api/stripe_routes.py` | Change `_apply_plan_to_user` to read from DB; keep `PLAN_CONFIG` as fallback |
| `backend/app/api/admin_routes.py` | Add product config CRUD endpoints + Stripe products listing |
| `backend/app/api/auth_routes.py` | Read default/trial tabs from AppSetting on registration |
| `backend/app/api/public_routes.py` (new) | `GET /api/plans` public endpoint |
| `frontend/src/components/admin/AdminPlatformPanel.tsx` (new) | Admin UI for product config |
| `frontend/src/components/landing/PricingToggle.tsx` | Dynamic pricing cards from API |
| `frontend/src/lib/api.ts` | Add API methods for product config and public plans |

## Out of Scope

- Stripe webhook for product.updated (admin manually syncs via UI)
- Multi-currency support (EUR only for now)
- Discount codes / coupon management (separate feature)
- Per-circuit pricing (all circuits same price per plan)
