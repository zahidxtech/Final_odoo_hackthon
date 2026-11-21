from __future__ import annotations

from datetime import datetime, timedelta, timezone

IST_TZ = timezone(timedelta(hours=5, minutes=30))
IST_OFFSET_MS = 5 * 3600 * 1000 + 30 * 60 * 1000


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def now_ms() -> int:
    return int(datetime.now(timezone.utc).timestamp() * 1000)


def parse_iso_ms(iso_str: str) -> int:
    normalized = iso_str.strip()
    if normalized.endswith("Z"):
        normalized = normalized[:-1] + "+00:00"
    dt = datetime.fromisoformat(normalized)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return int(dt.timestamp() * 1000)


def to_ist_date_string(dt: datetime | None = None) -> str:
    target = dt if dt is not None else datetime.now(timezone.utc)
    return target.astimezone(IST_TZ).strftime("%Y-%m-%d")


def add_days_to_date_str(date_str: str, days: int) -> str:
    y, m, d = [int(part) for part in date_str.split("-")]
    dt = datetime(y, m, d, tzinfo=timezone.utc) + timedelta(days=days)
    return dt.strftime("%Y-%m-%d")


def ist_date_time_to_ms(date_str: str, time_hhmm: str) -> int:
    y, m, d = [int(part) for part in date_str.split("-")]
    hh, mm = [int(part) for part in time_hhmm.split(":")]
    dt = datetime(y, m, d, hh, mm, 0, tzinfo=IST_TZ)
    return int(dt.timestamp() * 1000)


def ms_to_ist_iso(ms: int) -> str:
    dt = datetime.fromtimestamp(ms / 1000.0, tz=IST_TZ)
    return dt.isoformat(timespec="milliseconds")


def ms_to_ist_hhmm(ms: int) -> str:
    dt = datetime.fromtimestamp(ms / 1000.0, tz=IST_TZ)
    return dt.strftime("%H:%M")


def calculate_age_years(dob_str: str, ref_date_str: str | None = None) -> int:
    ref = ref_date_str or to_ist_date_string()
    by, bm, bd = [int(part) for part in dob_str.split("-")]
    ry, rm, rd = [int(part) for part in ref.split("-")]
    age = ry - by
    if rm < bm or (rm == bm and rd < bd):
        age -= 1
    return age


def diff_days(from_date_str: str, to_date_str: str) -> int:
    fy, fm, fd = [int(part) for part in from_date_str.split("-")]
    ty, tm, td = [int(part) for part in to_date_str.split("-")]
    d1 = datetime(fy, fm, fd, tzinfo=timezone.utc)
    d2 = datetime(ty, tm, td, tzinfo=timezone.utc)
    return round((d2 - d1).total_seconds() / 86400.0)


def compute_membership_status(
    end_date_str: str, current_status: str, today_str: str | None = None
) -> str:
    if current_status in ("FROZEN", "CANCELLED"):
        return current_status
    days_left = diff_days(today_str or to_ist_date_string(), end_date_str)
    if days_left < 0:
        return "EXPIRED"
    if days_left <= 15:
        return "EXPIRING_SOON"
    return "ACTIVE"


def get_next_friday_date(from_date_str: str | None = None) -> str:
    base = from_date_str or to_ist_date_string()
    y, m, d = [int(part) for part in base.split("-")]
    dt = datetime(y, m, d, tzinfo=timezone.utc)
    # Python weekday(): Mon=0..Fri=4..Sun=6
    delta = (4 - dt.weekday() + 7) % 7
    return add_days_to_date_str(base, delta)
