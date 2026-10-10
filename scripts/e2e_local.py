"""Local end-to-end check in a real browser (Chromium via Playwright).
Runs against http://localhost:5173 with the local test stack behind it.
Screenshots go to /tmp/claude-0/shots/."""
import os, re, sys
from playwright.sync_api import sync_playwright, expect

BASE = "http://localhost:5173"
SHOTS = "/tmp/claude-0/shots"
os.makedirs(SHOTS, exist_ok=True)
ADMIN = ("admin@test.local", "Initial-Pass-2026")
NEW_ADMIN_PW = "Admin-New-2026x"
results = []

def step(name, fn):
    try:
        fn()
        results.append(("PASS", name, ""))
    except Exception as e:  # noqa
        results.append(("FAIL", name, str(e).splitlines()[0][:200]))

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 1280, "height": 900}, locale="he-IL")
    page = ctx.new_page()
    errors = []
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)

    def visitor_home():
        page.goto(BASE + "/")
        expect(page.locator(".day-title")).to_contain_text("מקומות פנויים", timeout=10000)
        expect(page.locator(".floor")).to_have_count(3)
        assert page.locator(".seat").count() == 204, page.locator(".seat").count()
        # visitor sees only public items
        assert page.get_by_role("link", name="משתמשים").count() == 0
        page.screenshot(path=f"{SHOTS}/01-home-visitor.png", full_page=True)
    step("visitor sees today's floors (3 floors, 204 seats)", visitor_home)

    def pick_day():
        before = page.locator(".day-title").inner_text()
        page.locator(".week-day").nth(1).click()
        expect(page.locator(".day-title")).not_to_have_text(before, timeout=5000)
    step("choosing another day updates the numbers", pick_day)

    def admin_login_forced_change():
        page.get_by_role("link", name="כניסה").click()
        page.get_by_label("אימייל").fill(ADMIN[0])
        page.get_by_label("סיסמה", exact=True).fill(ADMIN[1])
        page.get_by_role("button", name="כניסה", exact=True).click()
        expect(page).to_have_url(re.compile(r"/change-password$"), timeout=10000)
        page.screenshot(path=f"{SHOTS}/02-change-password.png")
        page.goto(BASE + "/users")          # cannot escape the change screen
        expect(page).to_have_url(re.compile(r"/change-password$"))
    step("temporary password forces the change screen", admin_login_forced_change)

    def weak_password_rejected():
        page.get_by_label("סיסמה חדשה").fill("short1")
        page.get_by_label("שוב, לאימות").fill("short1")
        page.get_by_role("button", name="שמירת הסיסמה").click()
        expect(page.get_by_role("alert")).to_contain_text("לפחות 10")
    step("weak password is rejected", weak_password_rejected)

    def set_password():
        page.get_by_label("סיסמה חדשה").fill(NEW_ADMIN_PW)
        page.get_by_label("שוב, לאימות").fill(NEW_ADMIN_PW)
        page.get_by_role("button", name="שמירת הסיסמה").click()
        expect(page).to_have_url(BASE + "/", timeout=10000)
        expect(page.get_by_role("link", name="משתמשים")).to_be_visible()
    step("new password saved, admin menu appears", set_password)

    created = {}
    def create_user():
        page.get_by_role("link", name="משתמשים").click()
        expect(page.locator("table")).to_be_visible(timeout=10000)
        f = page.get_by_role("form", name="משתמש חדש")
        f.get_by_label("אימייל").fill("new.manager@example.com")
        f.get_by_label("תפקיד").select_option("manager")
        f.get_by_label("מספר עובד").fill("10002")
        f.get_by_role("button", name="הוספת משתמש").click()
        pw = page.locator(".once-pass")
        expect(pw).to_be_visible(timeout=10000)
        created["pw"] = pw.inner_text()
        expect(page.locator("table")).to_contain_text("new.manager@example.com")
        page.screenshot(path=f"{SHOTS}/03-users.png", full_page=True)
    step("admin creates a manager linked to an employee", create_user)

    def duplicate_rejected():
        f = page.get_by_role("form", name="משתמש חדש")
        f.get_by_label("אימייל").fill("new.manager@example.com")
        f.get_by_role("button", name="הוספת משתמש").click()
        expect(page.get_by_role("alert")).to_contain_text("כבר קיים", timeout=10000)
    step("duplicate email is rejected with a clear message", duplicate_rejected)

    def new_user_login():
        page.get_by_role("button", name="יציאה").click()
        page.goto(BASE + "/login")
        page.get_by_label("אימייל").fill("new.manager@example.com")
        page.get_by_label("סיסמה", exact=True).fill(created["pw"])
        page.get_by_role("button", name="כניסה", exact=True).click()
        expect(page).to_have_url(re.compile(r"/change-password$"), timeout=10000)
        page.get_by_label("סיסמה חדשה").fill("Manager-Own-2026")
        page.get_by_label("שוב, לאימות").fill("Manager-Own-2026")
        page.get_by_role("button", name="שמירת הסיסמה").click()
        expect(page).to_have_url(BASE + "/", timeout=10000)
        expect(page.get_by_role("link", name="מבנה ארגוני")).to_be_visible()
        assert page.get_by_role("link", name="משתמשים").count() == 0, "manager sees admin menu"
    step("new manager logs in with the temp password and sets their own", new_user_login)

    def manager_blocked_from_api():
        r = page.evaluate("""async () => {
          const k = Object.keys(localStorage).find(k => k.includes('auth-token'));
          const t = JSON.parse(localStorage.getItem(k)).access_token;
          const r = await fetch('/api/admin-users', {method:'POST', headers:{'Content-Type':'application/json', Authorization:'Bearer '+t}, body: JSON.stringify({action:'list'})});
          return r.status; }""")
        assert r == 403, r
    step("manager cannot call the user-management function (403)", manager_blocked_from_api)

    def wrong_password():
        page.get_by_role("button", name="יציאה").click()
        page.goto(BASE + "/login")
        page.get_by_label("אימייל").fill(ADMIN[0])
        page.get_by_label("סיסמה", exact=True).fill("Wrong-pass-123")
        page.get_by_role("button", name="כניסה", exact=True).click()
        expect(page.get_by_role("alert")).to_contain_text("שגויים", timeout=10000)
        page.screenshot(path=f"{SHOTS}/04-login.png")
    step("wrong password shows a clear error", wrong_password)

    def mobile_and_dark():
        m = b.new_context(viewport={"width": 390, "height": 844}, locale="he-IL", color_scheme="dark", device_scale_factor=2)
        mp = m.new_page()
        mp.goto(BASE + "/")
        expect(mp.locator(".floor")).to_have_count(3, timeout=10000)
        w = mp.evaluate("document.documentElement.scrollWidth")
        assert w <= 390, f"horizontal scroll: {w}px"
        mp.screenshot(path=f"{SHOTS}/05-mobile-dark.png", full_page=True)
        m.close()
    step("mobile width, dark mode, no horizontal scroll", mobile_and_dark)

    real_errors = [e for e in errors if "Failed to load resource" not in e]
    step("no console errors", lambda: (_ for _ in ()).throw(AssertionError(real_errors[:3])) if real_errors else None)
    b.close()

for s, n, d in results:
    print(f"  {s}  {n}" + (f"  -> {d}" if d else ""))
failed = sum(1 for r in results if r[0] == "FAIL")
print(f"\n{len(results) - failed} passed, {failed} failed")
sys.exit(1 if failed else 0)
