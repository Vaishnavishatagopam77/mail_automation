"""
RSVP Email Automation — Streamlit Frontend
Run: streamlit run app.py
"""

import streamlit as st
import smtplib
import sqlite3
import secrets
import hashlib
import uuid
import csv
import io
import os
from datetime import datetime, timedelta
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.base import MIMEBase
from typing import Optional

# ── Config ────────────────────────────────────────────────────────────────────

DB_PATH = "rsvp.db"
BASE_URL = os.getenv("BASE_URL", "http://localhost:8501")  # override in production
WHATSAPP_LINK = "https://chat.whatsapp.com/FjVIMzxniM7KMWuZGNdu1L"

# ── Database setup ────────────────────────────────────────────────────────────

def get_db():
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS campaigns (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            subject TEXT NOT NULL,
            body TEXT NOT NULL,
            event_title TEXT,
            event_date TEXT,
            event_time TEXT,
            event_location TEXT,
            organizer_name TEXT,
            organizer_message TEXT,
            sender_email TEXT NOT NULL,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS deliveries (
            id TEXT PRIMARY KEY,
            campaign_id TEXT NOT NULL,
            email TEXT NOT NULL,
            name TEXT,
            token_hash TEXT NOT NULL,
            token_expiry TEXT NOT NULL,
            delivery_status TEXT DEFAULT 'Pending',
            failure_reason TEXT,
            FOREIGN KEY (campaign_id) REFERENCES campaigns(id)
        );

        CREATE TABLE IF NOT EXISTS responses (
            id TEXT PRIMARY KEY,
            campaign_id TEXT NOT NULL,
            email TEXT NOT NULL,
            answer TEXT NOT NULL,
            responded_at TEXT NOT NULL,
            FOREIGN KEY (campaign_id) REFERENCES campaigns(id)
        );
    """)
    conn.commit()
    conn.close()

init_db()

# ── Token helpers ─────────────────────────────────────────────────────────────

def generate_token() -> tuple[str, str]:
    """Returns (raw_token_hex, sha256_hash)."""
    raw = secrets.token_bytes(32)
    raw_hex = raw.hex()
    hashed = hashlib.sha256(raw).hexdigest()
    return raw_hex, hashed

def validate_token(raw_hex: str) -> Optional[sqlite3.Row]:
    """Returns the delivery row if token is valid and unexpired, else None."""
    hashed = hashlib.sha256(bytes.fromhex(raw_hex)).hexdigest()
    conn = get_db()
    row = conn.execute(
        "SELECT * FROM deliveries WHERE token_hash = ?", (hashed,)
    ).fetchone()
    conn.close()
    if not row:
        return None
    if datetime.fromisoformat(row["token_expiry"]) < datetime.utcnow():
        return None
    return row

# ── Email builder ─────────────────────────────────────────────────────────────

def build_html(template: str, replacements: dict) -> str:
    for key, val in replacements.items():
        template = template.replace(f"{{{{{key}}}}}", str(val) if val else "")
    return template

def load_template() -> str:
    tpl_path = os.path.join("src", "templates", "rsvp-email.html")
    if os.path.exists(tpl_path):
        with open(tpl_path, "r", encoding="utf-8") as f:
            return f.read()
    # Fallback minimal template
    return FALLBACK_TEMPLATE

FALLBACK_TEMPLATE = """
<!DOCTYPE html><html><body style="font-family:sans-serif;max-width:600px;margin:auto;padding:20px">
<h2>{{eventTitle}}</h2>
<p>Hi {{name}} 🙌</p>
<p>{{body}}</p>
<p><strong>📅 {{eventDate}} {{eventTime}}</strong></p>
<p>Will you be joining us?</p>
<table><tr>
<td><a href="{{comingLink}}" style="background:#2da44e;color:#fff;padding:14px 28px;border-radius:6px;text-decoration:none;font-weight:bold">✅ Absolutely, I'm In!</a></td>
<td style="width:16px"></td>
<td><a href="{{notComingLink}}" style="background:#f3d0d7;color:#6e3040;padding:14px 28px;border-radius:6px;text-decoration:none;font-weight:bold">Next Time, May Be</a></td>
</tr></table>
<hr/>
<p style="color:#888;font-size:12px">Organised by {{organizerName}}</p>
</body></html>
"""

# ── SMTP sender ───────────────────────────────────────────────────────────────

def send_email(smtp_cfg: dict, to: str, subject: str, html_body: str) -> tuple[bool, str]:
    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = smtp_cfg["from"]
        msg["To"] = to
        msg.attach(MIMEText(html_body, "html"))

        use_ssl = smtp_cfg.get("ssl", False)

        if use_ssl:
            # SSL mode (port 465)
            with smtplib.SMTP_SSL(smtp_cfg["host"], smtp_cfg["port"], timeout=15) as server:
                server.ehlo()
                if smtp_cfg.get("user"):
                    server.login(smtp_cfg["user"], smtp_cfg["password"])
                server.sendmail(smtp_cfg["from"], to, msg.as_string())
        else:
            # STARTTLS mode (port 587)
            with smtplib.SMTP(smtp_cfg["host"], smtp_cfg["port"], timeout=15) as server:
                server.ehlo()
                if smtp_cfg.get("tls"):
                    server.starttls()
                    server.ehlo()
                if smtp_cfg.get("user"):
                    server.login(smtp_cfg["user"], smtp_cfg["password"])
                server.sendmail(smtp_cfg["from"], to, msg.as_string())
        return True, ""
    except Exception as e:
        return False, str(e)


def test_smtp_connection(smtp_cfg: dict) -> tuple[bool, str]:
    """Test SMTP credentials without sending an email."""
    try:
        use_ssl = smtp_cfg.get("ssl", False)
        if use_ssl:
            with smtplib.SMTP_SSL(smtp_cfg["host"], smtp_cfg["port"], timeout=10) as server:
                server.ehlo()
                if smtp_cfg.get("user"):
                    server.login(smtp_cfg["user"], smtp_cfg["password"])
        else:
            with smtplib.SMTP(smtp_cfg["host"], smtp_cfg["port"], timeout=10) as server:
                server.ehlo()
                if smtp_cfg.get("tls"):
                    server.starttls()
                    server.ehlo()
                if smtp_cfg.get("user"):
                    server.login(smtp_cfg["user"], smtp_cfg["password"])
        return True, "Connection successful!"
    except smtplib.SMTPAuthenticationError as e:
        return False, f"Authentication failed: {e.smtp_error.decode() if isinstance(e.smtp_error, bytes) else str(e)}"
    except Exception as e:
        return False, str(e)

# ── Campaign dispatch ─────────────────────────────────────────────────────────

def dispatch_campaign(campaign_id: str, recipients: list[dict], smtp_cfg: dict,
                      campaign: dict, base_url: str) -> dict:
    template = load_template()
    conn = get_db()
    results = {"sent": 0, "failed": 0, "errors": []}
    expiry = (datetime.utcnow() + timedelta(days=30)).isoformat()

    for r in recipients:
        email = r["email"].strip()
        name = r.get("name", "").strip() or "there"
        delivery_id = str(uuid.uuid4())
        raw_token, token_hash = generate_token()

        coming_link = f"{base_url}?page=respond&token={raw_token}&answer=Coming"
        not_coming_link = f"{base_url}?page=respond&token={raw_token}&answer=Not+Coming"

        html = build_html(template, {
            "subject": campaign["subject"],
            "eventTitle": campaign.get("event_title", campaign["name"]),
            "name": name,
            "body": campaign["body"],
            "eventDate": campaign.get("event_date", ""),
            "eventTime": campaign.get("event_time", ""),
            "eventLocation": campaign.get("event_location", ""),
            "organizerName": campaign.get("organizer_name", smtp_cfg["from"]),
            "organizerMessage": campaign.get("organizer_message", campaign["body"]),
            "eventDetails": campaign.get("event_details", ""),
            "comingLink": coming_link,
            "notComingLink": not_coming_link,
        })

        ok, reason = send_email(smtp_cfg, email, campaign["subject"], html)
        status = "Sent" if ok else "Failed"

        conn.execute(
            """INSERT INTO deliveries
               (id, campaign_id, email, name, token_hash, token_expiry, delivery_status, failure_reason)
               VALUES (?,?,?,?,?,?,?,?)""",
            (delivery_id, campaign_id, email, name, token_hash, expiry, status,
             reason if not ok else None)
        )
        conn.commit()

        if ok:
            results["sent"] += 1
        else:
            results["failed"] += 1
            results["errors"].append(f"{email}: {reason}")

    conn.close()
    return results

# ── Streamlit pages ───────────────────────────────────────────────────────────

st.set_page_config(page_title="RSVP Email Automation", page_icon="✉️", layout="wide")

params = st.query_params

# Handle RSVP response click (when recipient clicks button in email)
if params.get("page") == "respond":
    raw_token = params.get("token", "")
    answer = params.get("answer", "")

    st.title("RSVP Response")

    if not raw_token or not answer:
        st.error("Invalid link. Missing token or answer.")
        st.stop()

    try:
        delivery = validate_token(raw_token)
    except Exception:
        delivery = None

    if not delivery:
        st.error("⚠️ This link is invalid or has expired.")
        st.stop()

    conn = get_db()
    existing = conn.execute(
        "SELECT * FROM responses WHERE campaign_id=? AND email=?",
        (delivery["campaign_id"], delivery["email"])
    ).fetchone()

    if existing:
        st.info(f"✅ Your response (**{existing['answer']}**) has already been recorded. Thank you!")
        conn.close()
        st.stop()

    # Record response
    conn.execute(
        "INSERT INTO responses (id, campaign_id, email, answer, responded_at) VALUES (?,?,?,?,?)",
        (str(uuid.uuid4()), delivery["campaign_id"], delivery["email"],
         answer, datetime.utcnow().isoformat())
    )
    conn.commit()

    # Notify sender
    campaign = conn.execute(
        "SELECT * FROM campaigns WHERE id=?", (delivery["campaign_id"],)
    ).fetchone()
    conn.close()

    emoji = "✅" if answer == "Coming" else "❌"
    st.success(f"{emoji} Thank you! Your response **'{answer}'** has been recorded.")

    if answer == "Coming":
        st.balloons()
        st.markdown(
            f"""
            <meta http-equiv="refresh" content="2;url={WHATSAPP_LINK}" />
            <p style="font-size:18px">🎉 You're in! Redirecting you to the WhatsApp community group...</p>
            <p>If you are not redirected automatically, <a href="{WHATSAPP_LINK}" target="_blank">click here to join</a>.</p>
            """,
            unsafe_allow_html=True
        )

    st.stop()

# ── Main app ──────────────────────────────────────────────────────────────────

st.title("✉️ RSVP Email Automation")
st.caption("Send event invitations with one-click RSVP buttons to your guest list.")

tab1, tab2, tab3 = st.tabs(["📤 Send Campaign", "📊 Track Responses", "⚙️ SMTP Settings"])

# ── Tab 1: Send Campaign ──────────────────────────────────────────────────────
with tab1:
    st.subheader("Compose & Send")

    col1, col2 = st.columns([1, 1])

    with col1:
        st.markdown("**Event Details**")
        event_title = st.text_input("Event Title", placeholder="GitHub Copilot Dev Days | Hyderabad")
        event_date = st.text_input("Date", placeholder="Saturday, 28-Mar-2026")
        event_time = st.text_input("Time", placeholder="09:00 AM To 04:00 PM IST")
        event_location = st.text_input("Location", placeholder="Microsoft Office, Hyderabad")
        organizer_name = st.text_input("Organizer Name", placeholder="Team MFUGH")

    with col2:
        st.markdown("**Email Content**")
        campaign_name = st.text_input("Campaign Name", placeholder="MFUGH Dev Days RSVP")
        subject = st.text_input("Email Subject", placeholder="You're shortlisted! Confirm your RSVP")
        body = st.text_area("Message Body", height=120,
                            placeholder="Congratulations! You've been shortlisted for our event. Please confirm your attendance.")
        organizer_message = st.text_area("Organizer Message (shown in email box)", height=80,
                                         placeholder="Hi 🙌\nCongratulations! 🎉\nYou have been shortlisted...")

    st.divider()
    st.markdown("**Recipient List**")

    input_method = st.radio("Add recipients via:", ["Paste emails", "Upload CSV"], horizontal=True)

    recipients: list[dict] = []

    if input_method == "Paste emails":
        raw_emails = st.text_area(
            "Enter email addresses (one per line, or comma-separated).\n"
            "Optionally add name: `email, name`",
            height=150,
            placeholder="alice@example.com, Alice\nbob@example.com\ncarol@example.com, Carol"
        )
        if raw_emails.strip():
            for line in raw_emails.replace(",\n", "\n").splitlines():
                parts = [p.strip() for p in line.split(",")]
                if parts and "@" in parts[0]:
                    recipients.append({"email": parts[0], "name": parts[1] if len(parts) > 1 else ""})

    else:
        uploaded = st.file_uploader("Upload CSV (columns: email, name)", type=["csv"])
        if uploaded:
            reader = csv.DictReader(io.StringIO(uploaded.read().decode("utf-8")))
            for row in reader:
                email = row.get("email", row.get("Email", "")).strip()
                name = row.get("name", row.get("Name", "")).strip()
                if email and "@" in email:
                    recipients.append({"email": email, "name": name})

    if recipients:
        st.success(f"✅ {len(recipients)} recipient(s) loaded")
        with st.expander("Preview recipient list"):
            for r in recipients[:20]:
                st.text(f"  {r['email']}  {('— ' + r['name']) if r['name'] else ''}")
            if len(recipients) > 20:
                st.caption(f"... and {len(recipients) - 20} more")

    st.divider()

    # SMTP config from session state (set in Settings tab)
    smtp_ready = bool(st.session_state.get("smtp_host") and st.session_state.get("smtp_from"))

    if not smtp_ready:
        st.warning("⚠️ Configure your SMTP settings in the **⚙️ SMTP Settings** tab before sending.")

    send_btn = st.button(
        "🚀 Send RSVP Emails",
        disabled=not (recipients and subject and body and smtp_ready),
        type="primary",
        use_container_width=True
    )

    if send_btn:
        smtp_cfg = {
            "host": st.session_state.smtp_host,
            "port": int(st.session_state.get("smtp_port", 587)),
            "user": st.session_state.get("smtp_user", ""),
            "password": st.session_state.get("smtp_password", ""),
            "from": st.session_state.smtp_from,
            "tls": st.session_state.get("smtp_tls", True),
            "ssl": st.session_state.get("smtp_ssl", False),
        }

        campaign_id = str(uuid.uuid4())
        conn = get_db()
        conn.execute(
            """INSERT INTO campaigns
               (id, name, subject, body, event_title, event_date, event_time,
                event_location, organizer_name, organizer_message, sender_email, created_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
            (campaign_id, campaign_name or event_title or "Campaign",
             subject, body, event_title, event_date, event_time,
             event_location, organizer_name, organizer_message,
             smtp_cfg["from"], datetime.utcnow().isoformat())
        )
        conn.commit()
        conn.close()

        campaign = {
            "name": campaign_name or event_title or "Campaign",
            "subject": subject,
            "body": body,
            "event_title": event_title,
            "event_date": event_date,
            "event_time": event_time,
            "event_location": event_location,
            "organizer_name": organizer_name,
            "organizer_message": organizer_message,
        }

        base_url = st.session_state.get("base_url", BASE_URL)

        progress = st.progress(0, text="Sending emails...")
        results = {"sent": 0, "failed": 0, "errors": []}
        template = load_template()
        conn = get_db()
        expiry = (datetime.utcnow() + timedelta(days=30)).isoformat()

        for i, r in enumerate(recipients):
            email = r["email"].strip()
            name = r.get("name", "").strip() or "there"
            delivery_id = str(uuid.uuid4())
            raw_token, token_hash = generate_token()

            coming_link = f"{base_url}?page=respond&token={raw_token}&answer=Coming"
            not_coming_link = f"{base_url}?page=respond&token={raw_token}&answer=Not+Coming"

            html = build_html(template, {
                "subject": subject,
                "eventTitle": event_title,
                "name": name,
                "body": body,
                "eventDate": event_date,
                "eventTime": event_time,
                "eventLocation": event_location,
                "organizerName": organizer_name,
                "organizerMessage": organizer_message,
                "eventDetails": f"{event_date} · {event_time} · {event_location}",
                "comingLink": coming_link,
                "notComingLink": not_coming_link,
            })

            ok, reason = send_email(smtp_cfg, email, subject, html)
            status = "Sent" if ok else "Failed"

            conn.execute(
                """INSERT INTO deliveries
                   (id, campaign_id, email, name, token_hash, token_expiry, delivery_status, failure_reason)
                   VALUES (?,?,?,?,?,?,?,?)""",
                (delivery_id, campaign_id, email, name, token_hash, expiry, status,
                 reason if not ok else None)
            )
            conn.commit()

            if ok:
                results["sent"] += 1
            else:
                results["failed"] += 1
                results["errors"].append(f"{email}: {reason}")

            progress.progress((i + 1) / len(recipients),
                              text=f"Sending... {i+1}/{len(recipients)}")

        conn.close()
        progress.empty()

        if results["failed"] == 0:
            st.success(f"🎉 All {results['sent']} emails sent successfully!")
        else:
            st.warning(f"✅ {results['sent']} sent, ❌ {results['failed']} failed")
            with st.expander("Failed deliveries"):
                for err in results["errors"]:
                    st.text(err)

        st.session_state["last_campaign_id"] = campaign_id

# ── Tab 2: Track Responses ────────────────────────────────────────────────────
with tab2:
    st.subheader("Response Tracker")

    conn = get_db()
    campaigns = conn.execute(
        "SELECT * FROM campaigns ORDER BY created_at DESC"
    ).fetchall()
    conn.close()

    if not campaigns:
        st.info("No campaigns sent yet. Go to **Send Campaign** to get started.")
    else:
        campaign_options = {f"{c['name']} ({c['created_at'][:10]})": c["id"] for c in campaigns}
        selected_label = st.selectbox("Select Campaign", list(campaign_options.keys()))
        selected_id = campaign_options[selected_label]

        conn = get_db()
        deliveries = conn.execute(
            "SELECT * FROM deliveries WHERE campaign_id=?", (selected_id,)
        ).fetchall()
        responses = conn.execute(
            "SELECT * FROM responses WHERE campaign_id=?", (selected_id,)
        ).fetchall()
        conn.close()

        response_map = {r["email"]: r["answer"] for r in responses}
        total = len(deliveries)
        coming = sum(1 for r in responses if r["answer"] == "Coming")
        not_coming = sum(1 for r in responses if r["answer"] == "Not Coming")
        pending = total - len(responses)

        # Summary metrics
        m1, m2, m3, m4 = st.columns(4)
        m1.metric("Total Sent", total)
        m2.metric("✅ Coming", coming)
        m3.metric("❌ Not Coming", not_coming)
        m4.metric("⏳ Pending", pending)

        st.divider()

        # Recipient table
        rows = []
        for d in deliveries:
            answer = response_map.get(d["email"], "—")
            rows.append({
                "Email": d["email"],
                "Name": d["name"] or "—",
                "Delivery": d["delivery_status"],
                "RSVP": answer,
            })

        st.dataframe(rows, use_container_width=True)

        # CSV export
        if rows:
            csv_buf = io.StringIO()
            writer = csv.DictWriter(csv_buf, fieldnames=["Email", "Name", "Delivery", "RSVP"])
            writer.writeheader()
            writer.writerows(rows)
            st.download_button(
                "⬇️ Export CSV",
                data=csv_buf.getvalue(),
                file_name=f"responses_{selected_id[:8]}.csv",
                mime="text/csv"
            )

# ── Tab 3: SMTP Settings ──────────────────────────────────────────────────────
with tab3:
    st.subheader("SMTP Configuration")
    st.caption("Your credentials are stored only in your browser session and never saved to disk.")

    with st.form("smtp_form"):
        smtp_host = st.text_input("SMTP Host", value=st.session_state.get("smtp_host", "smtp.gmail.com"),
                                   placeholder="smtp.gmail.com")

        col_port, col_mode = st.columns(2)
        with col_port:
            smtp_port = st.number_input("SMTP Port", value=int(st.session_state.get("smtp_port", 587)),
                                         min_value=1, max_value=65535)
        with col_mode:
            smtp_mode = st.selectbox(
                "Security",
                ["STARTTLS (port 587)", "SSL (port 465)", "None (port 25)"],
                index=["STARTTLS (port 587)", "SSL (port 465)", "None (port 25)"].index(
                    st.session_state.get("smtp_mode", "STARTTLS (port 587)")
                )
            )

        smtp_from = st.text_input("From Email", value=st.session_state.get("smtp_from", ""),
                                   placeholder="you@example.com")
        smtp_user = st.text_input("Username", value=st.session_state.get("smtp_user", ""),
                                   placeholder="you@example.com")
        smtp_password = st.text_input("Password / App Password", type="password",
                                       value=st.session_state.get("smtp_password", ""))
        base_url_input = st.text_input(
            "App Base URL (for RSVP links)",
            value=st.session_state.get("base_url", BASE_URL),
            help="The public URL of this Streamlit app. Recipients click RSVP links pointing here."
        )

        col_save, col_test = st.columns(2)
        with col_save:
            saved = st.form_submit_button("💾 Save Settings", type="primary", use_container_width=True)
        with col_test:
            test_btn = st.form_submit_button("🔌 Test Connection", use_container_width=True)

        if saved or test_btn:
            st.session_state.smtp_host = smtp_host
            st.session_state.smtp_port = smtp_port
            st.session_state.smtp_from = smtp_from
            st.session_state.smtp_user = smtp_user
            st.session_state.smtp_password = smtp_password
            st.session_state.smtp_mode = smtp_mode
            st.session_state.smtp_tls = "STARTTLS" in smtp_mode
            st.session_state.smtp_ssl = "SSL" in smtp_mode
            st.session_state.base_url = base_url_input
            if saved:
                st.success("✅ Settings saved for this session.")

        if test_btn:
            cfg = {
                "host": smtp_host,
                "port": int(smtp_port),
                "user": smtp_user,
                "password": smtp_password,
                "from": smtp_from,
                "tls": "STARTTLS" in smtp_mode,
                "ssl": "SSL" in smtp_mode,
            }
            ok, msg = test_smtp_connection(cfg)
            if ok:
                st.success(f"✅ {msg}")
            else:
                st.error(f"❌ {msg}")

    st.divider()
    st.markdown("**Gmail quick setup**")
    st.code("""
Option A — STARTTLS (recommended):
  Host: smtp.gmail.com  |  Port: 587  |  Security: STARTTLS
  Password: 16-char App Password from myaccount.google.com/apppasswords

Option B — SSL:
  Host: smtp.gmail.com  |  Port: 465  |  Security: SSL
  Password: 16-char App Password

⚠️  Regular Gmail password will NOT work — you must use an App Password.
    """)

    st.markdown("**Other providers**")
    st.code("""
Outlook / Hotmail:  smtp-mail.outlook.com  |  587  |  STARTTLS
Yahoo Mail:         smtp.mail.yahoo.com    |  587  |  STARTTLS
SendGrid:           smtp.sendgrid.net      |  587  |  STARTTLS  (user: apikey)
    """)
