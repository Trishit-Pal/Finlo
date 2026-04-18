"""Date range helpers for month-based queries."""


def month_date_range(year: int, month: int) -> tuple[str, str]:
    """Return (start_inclusive, end_exclusive) ISO date strings for a year-month."""
    start = f"{year:04d}-{month:02d}-01"
    if month == 12:
        end = f"{year + 1:04d}-01-01"
    else:
        end = f"{year:04d}-{month + 1:02d}-01"
    return start, end


def prefix_date_range(prefix: str) -> tuple[str, str]:
    """Given 'YYYY-MM', return (start_inclusive, end_exclusive) date strings."""
    year, month = int(prefix[:4]), int(prefix[5:7])
    return month_date_range(year, month)
