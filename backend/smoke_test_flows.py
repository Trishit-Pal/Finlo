"""10-flow deployment readiness smoke test against http://127.0.0.1:8765"""
import asyncio
import httpx

BASE = "http://127.0.0.1:8765"
PASS_COUNT = 0
FAIL_COUNT = 0
RESULTS = []


def chk(label, cond, detail=""):
    global PASS_COUNT, FAIL_COUNT
    status = "PASS" if cond else "FAIL"
    if cond:
        PASS_COUNT += 1
    else:
        FAIL_COUNT += 1
    RESULTS.append(f"  [{status}] {label}" + (f" — {detail}" if detail else ""))


async def run():
    async with httpx.AsyncClient(base_url=BASE, timeout=15) as c:

        # Flow 1: Auth
        print("Flow 1: Auth (signup / signin / me)")
        r = await c.post("/auth/signup", json={
            "email": "smoketest@finlo.dev",
            "password": "SmokePass123!!",
            "full_name": "Smoke User",
        })
        chk("POST /auth/signup -> 201", r.status_code == 201, f"status={r.status_code} {r.text[:120]}")

        r = await c.post("/auth/signin", json={
            "email": "smoketest@finlo.dev",
            "password": "SmokePass123!!",
        })
        chk("POST /auth/signin -> 200", r.status_code == 200, f"status={r.status_code} {r.text[:120]}")
        token = r.json().get("access_token", "")
        chk("access_token present", bool(token))
        auth = {"Authorization": f"Bearer {token}"}

        r = await c.get("/auth/me", headers=auth)
        chk("GET /auth/me -> 200", r.status_code == 200, f"status={r.status_code} {r.text[:120]}")
        user_id = r.json().get("id", "")
        chk("user id present", bool(user_id))

        # Flow 2: Categories init
        print("Flow 2: Categories init")
        r = await c.post("/categories/init", headers=auth)
        chk("POST /categories/init -> 200", r.status_code == 200, f"status={r.status_code} {r.text[:120]}")
        cats = await c.get("/categories", headers=auth)
        chk("GET /categories -> 200", cats.status_code == 200)
        cat_list = cats.json()
        n_cats = len(cat_list) if isinstance(cat_list, list) else cat_list.get("total", 0)
        chk(f">= 13 default categories ({n_cats})", n_cats >= 13)

        # Flow 3: Transactions CRUD + CSV
        print("Flow 3: Transactions CRUD + CSV export")
        r = await c.post("/transactions", headers=auth, json={
            "amount": 450.0,
            "category": "Food & Dining",
            "merchant": "Zomato",
            "date": "2026-04-17",
            "type": "expense",
            "note": "lunch",
        })
        chk("POST /transactions -> 201", r.status_code == 201, f"status={r.status_code} {r.text[:120]}")
        txn_id = r.json().get("id", "")

        r = await c.get("/transactions", headers=auth)
        chk("GET /transactions -> 200", r.status_code == 200)
        items = r.json().get("items", r.json() if isinstance(r.json(), list) else [])
        chk("transaction in list", any(t.get("id") == txn_id for t in items), f"n={len(items)}")

        r = await c.patch(f"/transactions/{txn_id}", headers=auth, json={"amount": 500.0})
        chk("PATCH /transactions/:id -> 200", r.status_code == 200, f"status={r.status_code}")

        r = await c.get("/transactions/export", headers=auth)
        chk("GET /transactions/export -> 200 (CSV)", r.status_code == 200,
            f"status={r.status_code} ct={r.headers.get('content-type', '')}")

        r = await c.delete(f"/transactions/{txn_id}", headers=auth)
        chk("DELETE /transactions/:id -> 200/204", r.status_code in (200, 204), f"status={r.status_code}")

        # Flow 4: Budgets CRUD
        print("Flow 4: Budgets CRUD")
        r = await c.post("/budgets", headers=auth, json={
            "category": "Food & Dining",
            "limit_amount": 5000.0,
            "period": "monthly",
            "month": 4,
            "year": 2026,
        })
        chk("POST /budgets -> 201", r.status_code == 201, f"status={r.status_code} {r.text[:120]}")
        budget_id = r.json().get("id", "")

        r = await c.get("/budgets", headers=auth)
        chk("GET /budgets -> 200", r.status_code == 200)

        r = await c.patch(f"/budgets/{budget_id}", headers=auth, json={"limit_amount": 6000.0})
        chk("PATCH /budgets/:id -> 200", r.status_code == 200, f"status={r.status_code}")

        r = await c.delete(f"/budgets/{budget_id}", headers=auth)
        chk("DELETE /budgets/:id -> 200", r.status_code == 200, f"status={r.status_code}")

        # Flow 5: Bills + mark-paid
        print("Flow 5: Bills + mark-paid")
        r = await c.post("/bills", headers=auth, json={
            "name": "Electricity",
            "amount": 2500.0,
            "due_date": "2026-04-30",
            "frequency": "monthly",
            "category": "Utilities",
            "auto_create_expense": True,
        })
        chk("POST /bills -> 201", r.status_code == 201, f"status={r.status_code} {r.text[:120]}")
        bill_id = r.json().get("id", "")

        r = await c.post(f"/bills/{bill_id}/mark-paid", headers=auth)
        chk("POST /bills/:id/mark-paid -> 200", r.status_code == 200, f"status={r.status_code} {r.text[:120]}")

        # Flow 6: Debts + payment + summary
        print("Flow 6: Debts + payment + summary")
        r = await c.post("/debts", headers=auth, json={
            "name": "Car Loan",
            "type": "personal_loan",
            "total_amount": 300000.0,
            "remaining_balance": 300000.0,
            "interest_rate": 9.0,
            "emi_amount": 6000.0,
        })
        chk("POST /debts -> 201", r.status_code == 201, f"status={r.status_code} {r.text[:120]}")
        debt_id = r.json().get("id", "")

        r = await c.post(f"/debts/{debt_id}/payment", headers=auth, json={"amount": 6000.0})
        chk("POST /debts/:id/payment -> 200", r.status_code == 200, f"status={r.status_code}")
        chk("balance reduced", r.json().get("remaining_balance", 300000) < 300000.0)

        r = await c.get("/debts/summary", headers=auth)
        chk("GET /debts/summary -> 200", r.status_code == 200, f"status={r.status_code}")
        chk("summary has total_outstanding", "total_outstanding" in r.json())

        # Flow 7: Savings goal + contribute
        print("Flow 7: Savings goals")
        r = await c.post("/savings", headers=auth, json={
            "name": "Emergency Fund",
            "target_amount": 100000.0,
            "current_amount": 0.0,
            "deadline": "2026-12-31",
        })
        chk("POST /savings -> 201", r.status_code == 201, f"status={r.status_code} {r.text[:120]}")
        goal_id = r.json().get("id", "")

        r = await c.post(f"/savings/{goal_id}/contribute", headers=auth, json={"amount": 5000.0})
        chk("POST /savings/:id/contribute -> 200", r.status_code == 200, f"status={r.status_code}")
        chk("current_amount updated", r.json().get("current_amount", 0) >= 5000.0)

        # Flow 8: Analytics
        print("Flow 8: Analytics")
        r = await c.get("/analytics", headers=auth)
        chk("GET /analytics -> 200", r.status_code == 200, f"status={r.status_code}")

        r = await c.get("/analytics/summary", headers=auth, params={"month": 4, "year": 2026})
        chk("GET /analytics/summary -> 200", r.status_code == 200, f"status={r.status_code}")

        r = await c.get("/analytics/report", headers=auth, params={"month": 4, "year": 2026})
        chk("GET /analytics/report -> 200 (HTML)", r.status_code == 200, f"status={r.status_code}")
        chk("HTML report content", "Finlo Monthly Report" in r.text)

        # Flow 9: Feedback
        print("Flow 9: Feedback submission")
        r = await c.post("/feedback", headers=auth, json={
            "screen": "dashboard",
            "rating": 5,
            "text": "Smoke test feedback",
        })
        chk("POST /feedback -> 201", r.status_code == 201, f"status={r.status_code} {r.text[:120]}")

        # Flow 10: Delete account
        print("Flow 10: Delete account")
        r = await c.delete("/auth/me", headers=auth)
        chk("DELETE /auth/me -> 200", r.status_code == 200, f"status={r.status_code} {r.text[:120]}")

    print()
    print("=" * 60)
    print(f"SMOKE TEST RESULTS: {PASS_COUNT} passed, {FAIL_COUNT} failed")
    print("=" * 60)
    for line in RESULTS:
        print(line)
    print()
    if FAIL_COUNT == 0:
        print("ALL CHECKS PASSED — deployment ready")
    else:
        print(f"{FAIL_COUNT} CHECKS FAILED — see above")
    return FAIL_COUNT


if __name__ == "__main__":
    result = asyncio.run(run())
    raise SystemExit(result)
