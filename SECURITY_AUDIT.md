# Finlo Expense Tracker — Security & Code Quality Audit

**Date:** April 2026  
**Scope:** Android (Kotlin), Backend (Python/FastAPI), Frontend (React/TypeScript)  
**Assessment Type:** Security, Error Handling, UX, Data Handling, Performance, Code Quality

---

## Executive Summary

The Finlo expense tracker demonstrates strong foundational security practices (encryption, RLS, rate limiting, security headers) but has significant gaps in error handling, validation, and UX resilience. **Critical issues** center on unvalidated user input, missing null checks, and race conditions in async operations. **High-severity issues** involve inadequate error recovery and user-facing error message exposure.

**Risk Level:** Medium-High (suitable for personal/small team use; additional hardening needed for public production)

---

## BACKEND ASSESSMENT (Python FastAPI)

### CRITICAL Issues

#### 1. **Unvalidated User Input in Receipt Upload (MultiType)**
**File:** [backend/app/api/receipts.py](backend/app/api/receipts.py#L60-L95)  
**Issue:** The `upload_receipt` endpoint accepts `parsed_json` from client-side OCR without schema validation.

```python
if client_side_ocr and parsed_json:
    import json as _json
    client_data = _json.loads(parsed_json)  # ← No validation
    adapter = ClientOCRAdapter()
    ocr_result = adapter.parse(client_data)
```

**Risks:**
- Malformed JSON causes unhandled exception → 500 error leak
- No schema validation on `client_data` structure
- Missing try-except around `_json.loads()`

**Fix:** Add Pydantic model validation before parsing:
```python
from pydantic import BaseModel, ValidationError
class ClientOCRData(BaseModel):
    lines: list[str]
    confidence: float

try:
    client_data = ClientOCRData(**_json.loads(parsed_json))
except (json.JSONDecodeError, ValidationError) as e:
    raise HTTPException(status_code=422, detail="Invalid OCR data format")
```

---

#### 2. **Missing Null/Resource Check in Transaction PATCH**
**File:** [backend/app/api/transactions.py](backend/app/api/transactions.py#L135-L150)  
**Issue:**

```python
@router.patch("/{transaction_id}", response_model=TransactionOut)
async def update_transaction(transaction_id: str, body: TransactionUpdate, current_user: CurrentUser, db: DB) -> TransactionOut:
    result = await db.execute(
        select(Transaction).where(Transaction.id == transaction_id, Transaction.user_id == current_user.id)
    )
    txn = result.scalar_one_or_none()
    if not txn:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, ...)
    # ← Code continues but missing handling for all subsequent lines
```

The endpoint may continue without proper error handling in the body. Missing validation that `category` exists when updated.

**Fix:**
```python
if not txn:
    raise HTTPException(status_code=404, detail="Transaction not found")

# Validate category exists if provided
if body.category and body.category != txn.category:
    cat_result = await db.execute(
        select(Category).where(Category.id == body.category, Category.user_id == current_user.id)
    )
    if not cat_result.scalar_one_or_none():
        raise HTTPException(status_code=422, detail="Category not found")

# Update only provided fields...
```

---

#### 3. **SQL Injection-like Risk in Date Comparisons**
**File:** [backend/app/api/transactions.py](backend/app/api/transactions.py#L105-L120)  
**Issue:** Date filters use string comparisons directly without validation:

```python
if date_from:
    query = query.where(Transaction.date >= date_from)  # ← No ISO format validation
if date_to:
    query = query.where(Transaction.date <= date_to)
```

If `date_from`/`date_to` contain invalid format, database comparison may fail silently or behave unpredictably.

**Fix:**
```python
from datetime import datetime
def validate_iso_date(date_str: str) -> str:
    try:
        datetime.fromisoformat(date_str)
        return date_str
    except ValueError:
        raise HTTPException(status_code=422, detail="date_from must be ISO format (YYYY-MM-DD)")

if date_from:
    date_from = validate_iso_date(date_from)
```

---

#### 4. **Auth Token Exposure in Error Responses**
**File:** [backend/app/dependencies.py](backend/app/dependencies.py#L40-L60)  
**Issue:** Generic error messages don't leak secrets, but if exception middleware is generic, stack traces could expose token structure.

```python
except JWTError as exc:
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token") from exc
```

While the error message is safe, if DEBUG mode is on (or Sentry captures stack traces), the JWT payload may be logged.

**Fix:**
- Ensure Sentry is configured to redact auth headers:
```python
sentry_sdk.init(
    ...,
    before_send=lambda event, hint: None if 'Authorization' in event.get('request', {}).get('headers', {}) else event
)
```

---

### HIGH Issues

#### 5. **No Input Validation on Receipt File Metadata**
**File:** [backend/app/api/receipts.py](backend/app/api/receipts.py#L56-L80)  
**Issue:** File extension & MIME type validated, but filename not sanitized:

```python
raw_image_url = await storage.upload_encrypted(
    data=raw_bytes,
    key=f"{current_user.id}/{file.filename}",  # ← Unsanitized filename
    content_type=content_type,
)
```

**Risk:** Path traversal (e.g., `../../../etc/passwd.jpg`), or extremely long filenames cause issues downstream.

**Fix:**
```python
import os
safe_filename = os.path.basename(file.filename).replace('..', '').replace('/', '_')[:128]
key = f"{current_user.id}/{safe_filename}"
```

---

#### 6. **Missing Null Check on User Settings**
**File:** [backend/app/api/receipts.py](backend/app/api/receipts.py#L87)  
**Issue:**

```python
user_wants_storage = store_raw_image or (current_user.settings or {}).get("store_raw_images", False)
```

If `current_user.settings` is `None` and this is the **first** check, it's safe (`or {}`). However, in production, if `settings` column is unexpectedly `NULL` in subsequent queries, downstream code may fail silently.

**Fix:** Standardize settings on user creation:
```python
class User(Base):
    settings: Mapped[dict] = mapped_column(JSON, default_factory=dict, nullable=False)
```

---

#### 7. **Unhandled Exception in OCR Parser**
**File:** [backend/app/services/parser.py](backend/app/services/parser.py#L60-L100)  
**Issue:** Multiple regex patterns are applied without error handling. If a line causes regex timeout or malformed data:

```python
m = re.search(pattern, line, re.IGNORECASE)  # ← Could timeout on evil regex
```

**Fix:**
```python
import signal
def timeout_handler(signum, frame):
    raise TimeoutError("Regex timeout")

signal.signal(signal.SIGALRM, timeout_handler)
signal.alarm(1)  # 1 second timeout
try:
    m = re.search(pattern, line, re.IGNORECASE)
finally:
    signal.alarm(0)
```

Or use `regex` library with `timeout` parameter (safer).

---

#### 8. **No Audit Logging for Financial Operations**
**File:** [backend/app/api/transactions.py](backend/app/api/transactions.py), [categories.py](backend/app/api/categories.py)  
**Issue:** `create_transaction`, `delete_transaction`, `update_transaction` have no audit trail. GDPR/compliance risk.

**Fix:** Add audit table & log all financial mutations:
```python
class AuditLog(Base):
    __tablename__ = "audit_logs"
    id: Mapped[str] = ...
    user_id: Mapped[str] = ...
    action: Mapped[str]  # "create_transaction", "delete_bill"
    old_values: Mapped[str]  # JSON of before
    new_values: Mapped[str]  # JSON of after
    created_at: Mapped[datetime] = ...
```

---

#### 9. **Race Condition in Token Refresh**
**File:** [backend/app/api/auth.py](backend/app/api/auth.py#L367-L385)  
**Issue:**

```python
@router.post("/auth/refresh", response_model=AuthResponse)
async def refresh(body: RefreshRequest, db: DB) -> AuthResponse:
    try:
        payload = jwt.decode(body.refresh_token, settings.JWT_SECRET, ...)
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, ...)
    
    user_id = payload.get("sub")
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    
    new_access, new_refresh = _create_token_pair(user_id, user.email)
    return AuthResponse(access_token=new_access, refresh_token=new_refresh, user=...)
```

**Problem:** No check for token revocation or user account suspension (e.g., `is_active` flag). Simultaneously, no persistence of token refresh log = impossible to detect token reuse attacks.

**Fix:**
```python
if not user or not user.is_active:
    raise HTTPException(status_code=401, detail="User inactive or deleted")

# Log refresh for audit trail
await db.add(TokenRefreshLog(user_id=user_id, old_token_hash=sha256(body.refresh_token), created_at=datetime.now()))
```

---

#### 10. **Overly Broad Exception Catching**
**File:** [backend/app/api/auth.py](backend/app/api/auth.py#L424-L450)  
**Issue:**

```python
try:
    result = otp_provider.send_otp(email, otp_code)
except Exception as exc:  # ← Catches everything!
    logger.error(
        "otp_request_delivery_failed user_id=%s provider=%s error=%s",
        ...
    )
    raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="OTP delivery failed")
```

Catches `KeyboardInterrupt`, `SystemExit`, database errors indiscriminately. Masks real issues.

**Fix:**
```python
except (TimeoutError, ConnectionError, ValueError, requests.RequestException) as exc:
    logger.error(f"OTP delivery failed: {exc}", exc_info=True)
    raise HTTPException(status_code=503, detail="OTP service temporarily unavailable")
except Exception as exc:
    logger.exception("Unexpected OTP error")
    raise HTTPException(status_code=500, detail="Internal server error")
```

---

#### 11. **Missing Expense Encryption in Create/Update**
**File:** [backend/app/api/transactions.py](backend/app/api/transactions.py#L60-L80)  
**Issue:** Transaction creation doesn't encrypt sensitive fields (amount, merchant, notes per CLAUDE.md):

```python
txn = Transaction(
    user_id=current_user.id,
    date=body.date,
    merchant=body.merchant,  # ← Should be encrypted
    amount=body.amount,      # ← Should be encrypted
    ...
)
```

Fields should be encrypted server-side before storing in DB.

**Fix:**
```python
from app.services.encryption import encrypt_value
txn = Transaction(
    user_id=current_user.id,
    date=body.date,
    merchant=encrypt_value(body.merchant),
    amount=encrypt_value(str(body.amount)),
    ...
)
```

---

### MEDIUM Issues

#### 12. **Weak OTP Validation**
**File:** [backend/app/api/auth.py](backend/app/api/auth.py#L455-L475)  
**Issue:**

```python
@router.post("/auth/otp/verify")
async def verify_otp(body: VerifyOTPRequest, db: DB) -> AuthResponse:
    # Query OTP token
    result = await db.execute(
        select(OTPToken).where(OTPToken.mobile_number == body.mobile_number)
    )
    otp_token = result.scalar_one_or_none()
    if not otp_token or otp_token.otp_hash != body.otp:  # ← Linear time comparison!
        raise HTTPException(status_code=400, detail="Invalid or expired OTP.")
```

String comparison `otp_hash != body.otp` is vulnerable to **timing attacks**. Attacker can measure response time to deduce correct OTP character-by-character.

**Fix:**
```python
import hmac
if not otp_token or not hmac.compare_digest(otp_token.otp_hash, body.otp):
    raise HTTPException(status_code=400, detail="Invalid or expired OTP.")
```

---

#### 13. **No Rate Limiting on Auth Endpoints**
**File:** [backend/app/api/auth.py](backend/app/api/auth.py#L130-L180)  
**Issue:** While global rate limit is `60/minute` (main.py), auth endpoints (signin, signup) are not rate-limited separately. Easy brute force.

**Fix:**
```python
from slowapi import Limiter
limiter = Limiter(key_func=get_remote_address)

@router.post("/auth/signin")
@limiter.limit("3/minute")  # Max 3 sign-in attempts per minute
async def signin(body: SigninRequest, ...) -> AuthResponse:
    ...
```

---

#### 14. **Incomplete Password Validation**
**File:** [backend/app/api/auth.py](backend/app/api/auth.py#L160-L180)  
**Issue:** Signup accepts any password without strength requirements (no check for minimum length, complexity).

**Fix:**
```python
import re

def validate_password(password: str):
    if len(password) < 10:
        raise ValueError("Password must be at least 10 characters")
    if not re.search(r'[0-9]', password):
        raise ValueError("Password must contain at least 2 digits")
    if not re.search(r'[a-zA-Z]', password):
        raise ValueError("Password must contain letters")
    return True

@router.post("/auth/signup", ...)
async def signup(body: SignupRequest, ...) -> AuthResponse:
    try:
        validate_password(body.password)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
```

---

#### 15. **Missing CSRF Protection**
**File:** [backend/app/main.py](backend/app/main.py#L50-L85)  
**Issue:** No CSRF tokens required for state-changing operations (POST, PATCH, DELETE). If frontend is served from same origin, vulnerable to CSRF.

**Fix:** (if web frontend is same-origin)
```python
from fastapi_csrf_protect import CsrfProtect

@app.post("/transactions")
async def create_transaction(body: TransactionCreate, csrf_protect: CsrfProtect = Depends()) -> TransactionOut:
    await csrf_protect.validate_csrf(request)
    ...
```

---

#### 16. **Hardcoded Encryption Key in Config**
**File:** [backend/app/config.py](backend/app/config.py#L50)  
**Issue:**

```python
PII_ENCRYPTION_KEY: str = "5MP_jPvUiaRF0CtBgwAx4_OOR9nZUJq3wQImCG40Iak="
```

Default key is hardcoded. If dev code is shared, secrets are exposed. Also, `STORAGE_ENCRYPTION_KEY` defaults to all zeros (dev default).

**Fix:**
```python
from pydantic import Field

PII_ENCRYPTION_KEY: str = Field(..., description="Must be set via environment variable")
STORAGE_ENCRYPTION_KEY: str = Field(..., description="Must be set via environment variable")

@model_validator(mode="after")
def validate_production_settings(self):
    if self.ENVIRONMENT == "production":
        if not self.PII_ENCRYPTION_KEY or self.PII_ENCRYPTION_KEY == "change-me":
            raise ValueError("PII_ENCRYPTION_KEY must be set in production")
        ...
```

---

### LOW Issues

#### 17. **Loose JSON Schema Serialization**
**File:** [backend/app/api/budgets.py](backend/app/api/budgets.py#L50-L100)  
**Issue:** Complex Pydantic models don't set `json_schema_extra` or `SerializationInfo`, may expose internal fields.

**Fix:**
```python
class BudgetOut(BaseModel):
    model_config = ConfigDict(exclude={'internal_id', 'debug_data'})
    ...
```

---

#### 18. **Logging May Expose Sensitive Data**
**File:** [backend/app/utils/logging.py](backend/app/utils/logging.py#L50-L70)  
**Issue:** While headers are not logged by default, if exception occurs in decorator, request body containing passwords could be logged.

**Fix:**
```python
def sanitize_body(body: dict) -> dict:
    sensitive_fields = {'password', 'pin', 'access_token', 'refresh_token'}
    return {k: '***' if k in sensitive_fields else v for k, v in body.items()}

class LoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        try:
            body = await request.body()
            if request.method in ('POST', 'PATCH'):
                # Optionally log sanitized body
                ...
        except:
            pass
```

---

---

## FRONTEND ASSESSMENT (React/TypeScript)

### CRITICAL Issues

#### 19. **Unhandled Promise Rejection in Dashboard**
**File:** [frontend/src/pages/Dashboard.tsx](frontend/src/pages/Dashboard.tsx#L45-L65)  
**Issue:**

```typescript
const fetchAll = async () => {
  setLoading(true);
  try {
    const [dashRes, billsRes] = await Promise.all([
      api.get('/coach/dashboard', { params: { timeframe } }),
      api.get('/bills/upcoming/next7days').catch(() => ({ data: [] })),  // ← Swallows error
    ]);
    setData(dashRes.data);
    setUpcomingBills(billsRes.data || []);
  } catch (e) {
    console.error(e);  // ← Swallows error, no user feedback
  } finally {
    setLoading(false);
  }
};
```

**Problem:**
- Second API fails silently (caught by `.catch()`), user sees stale/empty data without error message
- First API error is caught but no UI error state set → loading spinner stuck forever
- No retry mechanism

**Fix:**
```typescript
const [error, setError] = useState<string | null>(null);

const fetchAll = async () => {
  setLoading(true);
  setError(null);
  try {
    const [dashRes, billsRes] = await Promise.all([
      api.get('/coach/dashboard', { params: { timeframe } }),
      api.get('/bills/upcoming/next7days'),
    ]);
    setData(dashRes.data);
    setUpcomingBills(billsRes.data || []);
  } catch (e: any) {
    const errorMsg = e.response?.data?.detail || 'Failed to load dashboard. Please try again.';
    setError(errorMsg);
    console.error('Dashboard fetch error:', e);
  } finally {
    setLoading(false);
  }
};

// In render:
{error && (
  <div className="error-banner">
    {error}
    <button onClick={fetchAll}>Retry</button>
  </div>
)}
```

---

#### 20. **Token Refresh Loop / Infinite Retry**
**File:** [frontend/src/services/api.ts](frontend/src/services/api.ts#L40-L90)  
**Issue:**

```typescript
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (
      error.response?.status === 401 &&
      !originalRequest._retry &&
      !originalRequest.url?.includes('/auth/refresh') &&
      !originalRequest.url?.includes('/auth/signin')
    ) {
      originalRequest._retry = true;
      const refreshToken = getStoredRefresh();
      if (!refreshToken) {
        clearStoredTokens();
        window.dispatchEvent(new Event('auth:unauthorized'));
        return Promise.reject(error);
      }

      try {
        if (!refreshPromise) {
          refreshPromise = axios
            .post(`${API_URL}/auth/refresh`, { refresh_token: refreshToken })
            .then((res) => {
              const { access_token, refresh_token: newRefresh } = res.data;
              setStoredTokens(access_token, newRefresh);
              return access_token;
            })
            .finally(() => { refreshPromise = null; });
        }

        const newAccessToken = await refreshPromise;
        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        return api(originalRequest);  // ← RETRY!
      } catch {
        clearStoredTokens();
        window.dispatchEvent(new Event('auth:unauthorized'));
        return Promise.reject(error);
      }
    }
    ...
  }
);
```

**Problems:**
1. **Infinite loop risk:** If refresh endpoint returns 401 (e.g., refresh token is also expired), the retry of `originalRequest` will fail with 401 again, triggering another refresh attempt indefinitely.
2. **Race condition:** Multiple concurrent 401s may trigger multiple refresh attempts (mitigated by `refreshPromise` but still fragile).
3. **No max retry limit:** If backend rate limiting kicks in, client retries continuously.

**Fix:**
```typescript
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    const retryCount = (originalRequest._retryCount || 0);
    const MAX_RETRIES = 1;  // Only retry once

    if (
      error.response?.status === 401 &&
      retryCount < MAX_RETRIES &&
      !originalRequest.url?.includes('/auth/refresh') &&
      !originalRequest.url?.includes('/auth/signin')
    ) {
      originalRequest._retryCount = retryCount + 1;
      const refreshToken = getStoredRefresh();
      if (!refreshToken) {
        clearStoredTokens();
        window.dispatchEvent(new Event('auth:unauthorized'));
        return Promise.reject(error);
      }

      try {
        if (!refreshPromise) {
          refreshPromise = axios
            .post(`${API_URL}/auth/refresh`, { refresh_token: refreshToken }, { timeout: 5000 })
            .then((res) => {
              setStoredTokens(res.data.access_token, res.data.refresh_token);
              return res.data.access_token;
            })
            .catch((refreshError) => {
              clearStoredTokens();
              window.dispatchEvent(new Event('auth:unauthorized'));
              throw refreshError;
            })
            .finally(() => { refreshPromise = null; });
        }

        const newAccessToken = await refreshPromise;
        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        return api(originalRequest);
      } catch {
        return Promise.reject(error);
      }
    }

    if (error.response?.status === 401) {
      clearStoredTokens();
      window.dispatchEvent(new Event('auth:unauthorized'));
    }
    return Promise.reject(error);
  }
);
```

---

#### 21. **Missing Form Submission Error State**
**File:** [frontend/src/components/AuthForm.tsx](frontend/src/components/AuthForm.tsx#L60-L85)  
**Issue:**

```typescript
const onSubmit = async (data: FormData) => {
  setError('');
  setSuccessMsg('');

  if (authMode === 'signup' && !pwValidation.isValid) {
    setError('Password does not meet all requirements.');
    return;
  }

  try {
    if (authMode === 'login' || authMode === 'signup') {
      const endpoint = authMode === 'login' ? '/auth/signin' : '/auth/signup';
      const response = await api.post(endpoint, data);
      setAuth(response.data);  // ← Assumes success, no redirect!
    }
  } catch (err: any) {
    setError(err.response?.data?.detail || 'An error occurred during authentication');
  }
};
```

**Problems:**
1. **No loading state:** User can submit form multiple times (race condition).
2. **Success not confirmed:** After `setAuth()`, should redirect to dashboard or show success message — currently form just stays rendered.
3. **Network error vs validation error not distinguished:** Both show same generic message.

**Fix:**
```typescript
const { register, handleSubmit, formState: { errors, isSubmitting }, reset } = useForm<FormData>(...);
const { user } = useAuth();
const navigate = useNavigate();

useEffect(() => {
  if (user && authMode !== 'signup') {
    navigate('/dashboard');
  }
}, [user, navigate]);

const onSubmit = async (data: FormData) => {
  setError('');
  setSuccessMsg('');

  if (authMode === 'signup' && !pwValidation.isValid) {
    setError('Password does not meet all requirements.');
    return;
  }

  try {
    if (authMode === 'login' || authMode === 'signup') {
      const endpoint = authMode === 'login' ? '/auth/signin' : '/auth/signup';
      const response = await api.post(endpoint, data);
      setAuth(response.data);
      if (authMode === 'signup') {
        setSuccessMsg('Account created! Redirecting...');
        setTimeout(() => navigate('/dashboard'), 1500);
      }
    }
  } catch (err: any) {
    const detail = err.response?.data?.detail;
    if (err.response?.status === 409) {
      setError('Email already registered. Please sign in.');
    } else if (err.response?.status === 401) {
      setError('Invalid email or password.');
    } else if (err.code === 'ECONNABORTED') {
      setError('Request timeout. Please check your connection.');
    } else {
      setError(detail || 'Authentication failed. Please try again.');
    }
  }
};

// In render:
<button disabled={isSubmitting}>
  {isSubmitting ? 'Processing...' : 'Sign In'}
</button>
```

---

#### 22. **Unhandled Promise in Transactions List**
**File:** [frontend/src/pages/Transactions.tsx](frontend/src/pages/Transactions.tsx#L50-L70)  
**Issue:**

```typescript
const handleExport = async () => {
  try {
    const res = await api.get('/transactions/export', { responseType: 'blob' });
    const url = window.URL.createObjectURL(new Blob([res.data]));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'finlo-transactions.csv';
    a.click();
    window.URL.revokeObjectURL(url);
  } catch (e) { console.error(e); }  // ← Silent fail, no error feedback
};

const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  const tags = form.tags ? form.tags.split(',').map(t => t.trim()).filter(Boolean) : [];
  const payload = { ... };
  try {
    if (editingId) {
      await api.patch(`/transactions/${editingId}`, payload);
      toast('success', 'Transaction updated');
    } else {
      await api.post('/transactions', payload);
      toast('success', 'Transaction added');
    }
  } catch (e) {
    toast('error', 'Failed to save transaction');  // ← Generic message
    return;
  }
  ...
};
```

**Problems:**
- Export error silently fails — user thinks download succeeded
- Submit error doesn't distinguish between network error, validation error, or server error
- No retry mechanism

**Fix:**
```typescript
const handleExport = async () => {
  try {
    const res = await api.get('/transactions/export', { responseType: 'blob', timeout: 30000 });
    if (!res.data || res.data.size === 0) {
      toast('error', 'Export file is empty');
      return;
    }
    const url = window.URL.createObjectURL(new Blob([res.data]));
    const a = document.createElement('a');
    a.href = url;
    a.download = `finlo-transactions-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
    toast('success', 'Export downloaded');
  } catch (e: any) {
    if (e.code === 'ECONNABORTED') {
      toast('error', 'Export timed out. File may be too large.');
    } else if (e.response?.status === 401) {
      toast('error', 'Session expired. Please log in again.');
    } else {
      toast('error', e.response?.data?.detail || 'Failed to export transactions');
    }
  }
};

const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  if (!form.merchant || !form.amount) {
    toast('error', 'Merchant and amount are required');
    return;
  }
  const tags = form.tags ? form.tags.split(',').map(t => t.trim()).filter(Boolean) : [];
  const payload = { ... };
  try {
    if (editingId) {
      await api.patch(`/transactions/${editingId}`, payload);
      toast('success', 'Transaction updated');
    } else {
      await api.post('/transactions', payload);
      toast('success', 'Transaction added');
    }
  } catch (e: any) {
    if (e.response?.status === 422) {
      toast('error', e.response.data.detail || 'Invalid transaction data');
    } else if (e.response?.status === 401) {
      toast('error', 'Session expired. Please log in again.');
    } else if (e.code === 'ECONNABORTED') {
      toast('error', 'Request timed out. Please try again.');
    } else {
      toast('error', e.response?.data?.detail || 'Failed to save transaction');
    }
    return;
  }
  setShowModal(false);
  setEditingId(null);
  setForm({ type: 'expense', amount: '', merchant: '', category: '', ... });
  fetchTransactions();
};
```

---

#### 23. **Race Condition in Session Lock**
**File:** [frontend/src/components/SessionLock.tsx](frontend/src/components/SessionLock.tsx#L30-L60)  
**Issue:**

```typescript
const resetTimer = useCallback(() => {
  if (timerRef.current) clearTimeout(timerRef.current);
  timerRef.current = setTimeout(lock, INACTIVITY_TIMEOUT);
}, [lock]);

useEffect(() => {
  if (locked) return;
  const events = ['mousedown', 'keydown', 'touchstart', 'scroll'];
  events.forEach(e => window.addEventListener(e, resetTimer));
  resetTimer();
  return () => {
    events.forEach(e => window.removeEventListener(e, resetTimer));
    if (timerRef.current) clearTimeout(timerRef.current);
  };
}, [locked, resetTimer]);
```

**Problem:** `resetTimer` depends on `[lock]`, which depends on `[localStorage.getItem(PIN_KEY)]`, causing excessive re-renders and timer resets on every tiny interaction.

**Fix:**
```typescript
const lock = useCallback(() => {
  if (localStorage.getItem(PIN_KEY)) {
    setLocked(true);
    sessionStorage.setItem(LOCK_KEY, 'true');
  }
}, []);

const resetTimer = useCallback(() => {
  if (timerRef.current) clearTimeout(timerRef.current);
  timerRef.current = setTimeout(lock, INACTIVITY_TIMEOUT);
}, [lock]);

useEffect(() => {
  if (locked) return;
  const events = ['mousedown', 'keydown', 'touchstart', 'scroll'];
  
  events.forEach(e => window.addEventListener(e, resetTimer, { passive: true }));
  resetTimer();
  
  return () => {
    events.forEach(e => window.removeEventListener(e, resetTimer));
    if (timerRef.current) clearTimeout(timerRef.current);
  };
}, [locked, resetTimer]);
```

---

### HIGH Issues

#### 24. **Unhandled Upload Errors in Receipt Page**
**File:** [frontend/src/pages/Upload.tsx](frontend/src/pages/Upload.tsx#L10-L40)  
**Issue:**

```typescript
const onDrop = useCallback(async (acceptedFiles: File[]) => {
  const file = acceptedFiles[0];
  if (!file) return;

  setUploading(true);
  setError('');
  setDragFile(file);

  try {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('client_side_ocr', clientOcr.toString());

    const { data } = await api.post('/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });

    navigate(`/review/${data.receipt_id}`, {
      state: { parsed: data.parsed, confidence: data.ocr_confidence },
    });
  } catch (err: any) {
    setError(err.response?.data?.detail || 'Failed to upload receipt. Please try again.');
    setUploading(false);
  }
}, [clientOcr, navigate]);
```

**Problems:**
1. **No timeout handling:** Large file upload could hang indefinitely if network is slow. User might close app thinking it crashed.
2. **No progress feedback:** Multi-MB file upload shows no progress bar — user has no indication it's working.
3. **Memory leak risk:** If component unmounts during upload, `setError` called on unmounted component.

**Fix:**
```typescript
const [uploading, setUploading] = useState(false);
const [uploadProgress, setUploadProgress] = useState(0);
const [error, setError] = useState('');
const [clientOcr, setClientOcr] = useState(false);
const [dragFile, setDragFile] = useState<File | null>(null);
const navigate = useNavigate();
const isMountedRef = useRef(true);

useEffect(() => {
  return () => { isMountedRef.current = false; };
}, []);

const onDrop = useCallback(async (acceptedFiles: File[]) => {
  const file = acceptedFiles[0];
  if (!file) return;
  if (file.size > 10 * 1024 * 1024) {
    setError('File must be smaller than 10 MB');
    return;
  }

  setUploading(true);
  setError('');
  setUploadProgress(0);
  setDragFile(file);

  const formData = new FormData();
  formData.append('file', file);
  formData.append('client_side_ocr', clientOcr.toString());

  try {
    const { data } = await api.post('/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 60000,  // 60 second timeout
      onUploadProgress: (progressEvent: ProgressEvent) => {
        if (isMountedRef.current && progressEvent.total) {
          setUploadProgress(Math.round((progressEvent.loaded / progressEvent.total) * 100));
        }
      },
    });

    if (!isMountedRef.current) return;

    navigate(`/review/${data.receipt_id}`, {
      state: { parsed: data.parsed, confidence: data.ocr_confidence },
    });
  } catch (err: any) {
    if (!isMountedRef.current) return;

    if (err.code === 'ECONNABORTED') {
      setError('Upload timed out. Please try a smaller file or check your connection.');
    } else if (err.response?.status === 413) {
      setError('File is too large (max 10 MB).');
    } else if (err.response?.status === 422) {
      setError(err.response.data.detail || 'Invalid file format.');
    } else {
      setError(err.response?.data?.detail || 'Failed to upload receipt. Please try again.');
    }
    setUploading(false);
    setUploadProgress(0);
  }
}, [clientOcr, navigate]);

// In render:
{uploading && (
  <div className="relative h-1 bg-gray-700 rounded-full overflow-hidden">
    <div
      className="h-full bg-indigo-500 transition-all"
      style={{ width: `${uploadProgress}%` }}
    />
  </div>
)}
```

---

#### 25. **Missing Error Boundary for Dashboard**
**File:** [frontend/src/pages/Dashboard.tsx](frontend/src/pages/Dashboard.tsx#L1-L20)  
**Issue:** Dashboard can throw unhandled errors if data structure is malformed, crashing whole app.

**Fix:** Wrap in error boundary:
```typescript
<ErrorBoundary fallbackText="Dashboard failed to load. Please refresh.">
  <Dashboard />
</ErrorBoundary>
```

---

#### 26. **XSS Risk in Dynamic Classnames/Styles**
**File:** [frontend/src/pages/Budgets.tsx](frontend/src/pages/Budgets.tsx#L100-L110)  
**Issue:**

```typescript
const getBarColor = (level: string) => {
  if (level === 'hard') return { bar: '#f43f5e', glow: 'rgba(244,63,94,0.3)' };
  if (level === 'soft') return { bar: '#f59e0b', glow: 'rgba(245,158,11,0.3)' };
  return { bar: '#10b981', glow: 'rgba(16,185,129,0.3)' };
};

// Used as:
<div style={{ backgroundColor: colors.bar }} />  // Safe if level is from backend
```

If `level` comes from backend without validation, XSS is possible (e.g., `level = "'; alert('xss'); //"` could break out of style string). Low risk since level is enum, but good practice to validate.

**Fix:**
```typescript
const ALERT_LEVELS = ['ok', 'soft', 'hard'] as const;
type AlertLevel = typeof ALERT_LEVELS[number];

function isValidAlertLevel(level: any): level is AlertLevel {
  return ALERT_LEVELS.includes(level);
}

const getBarColor = (level: AlertLevel) => {
  const colors: Record<AlertLevel, { bar: string; glow: string }> = {
    hard: { bar: '#f43f5e', glow: 'rgba(244,63,94,0.3)' },
    soft: { bar: '#f59e0b', glow: 'rgba(245,158,11,0.3)' },
    ok: { bar: '#10b981', glow: 'rgba(16,185,129,0.3)' },
  };
  return colors[level];
};

// In component:
const colors = getBarColor(isValidAlertLevel(budget.alert_level) ? budget.alert_level : 'ok');
```

---

#### 27. **Missing Null Check on useAuth Hook**
**File:** [frontend/src/pages/Transactions.tsx](frontend/src/pages/Transactions.tsx#L50+)  
**Issue:** If component used outside `AuthProvider`, hook throws error (cannot access context).

**Fix:** Ensure wrapper:
```typescript
// App.tsx
<AuthProvider>
  <Router>
    <Routes>...</Routes>
  </Router>
</AuthProvider>
```

Or add runtime check in hook:
```typescript
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};
```

---

### MEDIUM Issues

#### 28. **Form Validation Not Enforced on Backend**
**File:** [frontend/src/components/AuthForm.tsx](frontend/src/components/AuthForm.tsx#L40-L60)  
**Issue:**

```typescript
const formSchema = z.object({
  email: z.string().email('Please enter a valid email'),
  password: z.string().min(1, 'Password is required'),
  full_name: z.string().optional(),
});
```

Frontend validates, but if attacker bypasses frontend (e.g., using curl), backend accepts any password. Backend should also validate.

**Fix:** (Backend)
```python
class SignupRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=10)  # Enforce minimum length
    full_name: Optional[str] = None

# In route:
if len(body.password) < 10 or not re.search(r'\d{2}', body.password):
    raise HTTPException(status_code=422, detail="Password too weak")
```

---

#### 29. **Missing Refetch on Window Focus**
**File:** [frontend/src/pages/Dashboard.tsx](frontend/src/pages/Dashboard.tsx#L45-L55)  
**Issue:** If user leaves app and comes back after time, data is stale. No automatic refetch on visibility change.

**Fix:**
```typescript
useEffect(() => {
  const handleVisibilityChange = () => {
    if (!document.hidden) {
      fetchAll();  // Refetch when user returns to tab
    }
  };
  document.addEventListener('visibilitychange', handleVisibilityChange);
  return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
}, []);
```

---

#### 30. **PIN Hashing Vulnerability**
**File:** [frontend/src/components/SessionLock.tsx](frontend/src/components/SessionLock.tsx#L6-L15)  
**Issue:**

```typescript
function hashPin(pin: string): string {
  let h = 0;
  for (let i = 0; i < pin.length; i++) {
    h = ((h << 5) - h + pin.charCodeAt(i)) | 0;
  }
  return String(h);
}
```

This is **not cryptographic hashing** — it's a simple arithmetic calculation. Two different PINs can hash to same value (collision). An attacker can reverse-engineer the PIN from hash.

**Fix:**
```typescript
import { sha256 } from 'js-sha256';  // Or use crypto.subtle.digest

function hashPin(pin: string): string {
  return sha256(pin);  // Much stronger
}

// Or use Web Crypto API (no deps):
async function hashPin(pin: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(pin);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
```

---

### LOW Issues

#### 31. **Hardcoded API URL in Development**
**File:** [frontend/src/services/api.ts](frontend/src/services/api.ts#L1-L5)  
**Issue:**

```typescript
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
```

Defaults to localhost, which fails in production if `.env` not set.

**Fix:**
```typescript
const API_URL = (() => {
  if (!import.meta.env.VITE_API_URL) {
    throw new Error('VITE_API_URL environment variable is required');
  }
  return import.meta.env.VITE_API_URL;
})();
```

And ensure `.env.production` is set during build.

---

#### 32. **Console Logging in Production**
**File:** [frontend/src/pages/**/*.tsx](frontend/src/pages)  
**Issue:** Many files have `console.error()` calls which may leak sensitive info in user's browser console.

**Fix:**
```typescript
const isDev = import.meta.env.DEV;
const Logger = {
  error: (msg: string, ...args: any[]) => {
    if (isDev) console.error(msg, ...args);
    else console.error('[Error captured for logging]');  // In production, send to Sentry
  },
};

Logger.error('API call failed:', error);
```

---

---

## MOBILE (ANDROID/KOTLIN) ASSESSMENT

### CRITICAL Issues

#### 33. **Bare Exception Catching in ViewModels**
**File:** [mobile/app/src/main/java/com/finlo/app/ui/auth/AuthViewModel.kt](mobile/app/src/main/java/com/finlo/app/ui/auth/AuthViewModel.kt#L35-L50)  
**Issue:**

```kotlin
fun login(email: String, password: String) {
  viewModelScope.launch {
    _state.value = AuthUiState(loading = true)
    try {
      val res = api.signin(SigninRequest(email, password))
      tokenManager.accessToken = res.accessToken
      tokenManager.refreshToken = res.refreshToken
      _state.value = AuthUiState(success = true)
    } catch (e: Exception) {  // ← Catches all exceptions!
      _state.value = AuthUiState(error = e.message ?: "Login failed")
    }
  }
}
```

**Problems:**
1. `catch (e: Exception)` catches `CancellationException`, `OutOfMemoryError`, etc. — should not catch these.
2. `e.message` can be null or unhelpful for user (e.g., "null", "Socket timeout").
3. No differentiation between network error, 401, 500 → all show same message.
4. No retry mechanism.

**Fix:**
```kotlin
fun login(email: String, password: String) {
  viewModelScope.launch {
    _state.value = AuthUiState(loading = true)
    try {
      val res = api.signin(SigninRequest(email, password))
      tokenManager.accessToken = res.accessToken
      tokenManager.refreshToken = res.refreshToken
      _state.value = AuthUiState(success = true)
    } catch (e: CancellationException) {
      throw e  // Re-throw cancellation
    } catch (e: retrofit2.HttpException) {
      val errorMsg = when (e.code()) {
        401 -> "Invalid email or password"
        409 -> "Email already registered"
        503 -> "Service temporarily unavailable"
        else -> "Authentication failed: ${e.message()}"
      }
      _state.value = AuthUiState(error = errorMsg)
    } catch (e: java.io.IOException) {
      _state.value = AuthUiState(error = "Network error: ${e.message ?: "Unknown"}")
    } catch (e: Exception) {
      _state.value = AuthUiState(error = "Unexpected error. Please try again.")
    }
  }
}
```

---

#### 34. **Token Stored Without Encryption Verification**
**File:** [mobile/app/src/main/java/com/finlo/app/util/TokenManager.kt](mobile/app/src/main/java/com/finlo/app/util/TokenManager.kt#L30-L40)  
**Issue:**

```kotlin
var accessToken: String?
  get() = prefs.getString("access_token", null)
  set(value) = prefs.edit().putString("access_token", value).apply()
```

While tokens ARE stored in `EncryptedSharedPreferences`, there's no verification that encryption is actually working. Issue: If device API < 23, `EncryptedSharedPreferences` may fall back to unencrypted storage.

**Fix:**
```kotlin
init {
  // Verify encryption is available
  if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
    Log.w("TokenManager", "Device does not support keystore encryption. Tokens may be stored insecurely.")
  }
}

var accessToken: String?
  get() = prefs.getString("access_token", null)
  set(value) {
    if (value != null && value.length < 20) {
      Log.w("TokenManager", "Token suspiciously short. May be corrupted.")
    }
    prefs.edit().putString("access_token", value).apply()
  }
```

---

#### 35. **No Network Timeout Configuration**
**File:** [mobile/app/src/main/java/com/finlo/app/di/AppModule.kt](mobile/app/src/main/java/com/finlo/app/di/AppModule.kt#L30-L55)  
**Issue:**

```kotlin
return OkHttpClient.Builder()
  .addInterceptor(authInterceptor)
  .addInterceptor(logging)
  .connectTimeout(15, TimeUnit.SECONDS)
  .readTimeout(30, TimeUnit.SECONDS)
  .build()
```

**Problem:** No `writeTimeout`. If request body takes 31+ seconds to send, connection hangs indefinitely.

**Fix:**
```kotlin
return OkHttpClient.Builder()
  .addInterceptor(authInterceptor)
  .addInterceptor(logging)
  .connectTimeout(15, TimeUnit.SECONDS)
  .readTimeout(30, TimeUnit.SECONDS)
  .writeTimeout(30, TimeUnit.SECONDS)
  .callTimeout(60, TimeUnit.SECONDS)  // Overall timeout
  .retryOnConnectionFailure(true)  // Automatic retry
  .build()
```

---

#### 36. **No Retry Logic for API Failures**
**File:** [mobile/app/src/main/java/com/finlo/app/ui/transactions/TransactionsViewModel.kt](mobile/app/src/main/java/com/finlo/app/ui/transactions/TransactionsViewModel.kt#L20-L35)  
**Issue:**

```kotlin
fun load() {
  viewModelScope.launch {
    _state.value = _state.value.copy(loading = true)
    try {
      val res = api.getTransactions(limit = 100)
      _state.value = _state.value.copy(loading = false, transactions = res.items)
    } catch (e: Exception) {  // ← Swallows error, no retry
      _state.value = _state.value.copy(loading = false)
    }
  }
}
```

**Problem:** Any failure (network, 500, timeout) silently fails — user sees empty list.

**Fix:**
```kotlin
fun load(retryCount: Int = 0) {
  viewModelScope.launch {
    _state.value = _state.value.copy(loading = true, error = null)
    try {
      val res = api.getTransactions(limit = 100)
      _state.value = _state.value.copy(loading = false, transactions = res.items)
    } catch (e: CancellationException) {
      throw e
    } catch (e: retrofit2.HttpException) {
      val errorMsg = when {
        e.code() == 401 -> "Session expired. Please log in again."
        e.code() >= 500 -> "Server error. Please try again."
        else -> "Failed to load transactions."
      }
      _state.value = _state.value.copy(loading = false, error = errorMsg)
    } catch (e: java.io.IOException) {
      _state.value = _state.value.copy(loading = false, error = "Network error. Check your connection.")
    } catch (e: Exception) {
      _state.value = _state.value.copy(loading = false, error = "Unexpected error. Please try again.")
    }
  }
}

fun retryLoad() {
  load()
}
```

---

#### 37. **No Handling of Biometric Cancellation**
**File:** [mobile/app/src/main/java/com/finlo/app/](mobile/app/src/main/java/com/finlo/app/)  
**Issue:** (Inferred from CLAUDE.md) Biometric login is supported, but likely doesn't handle:
- User canceling biometric prompt
- Device not supporting biometric
- Biometric data corrupted

**Fix:** (Pseudo-code)
```kotlin
private val biometricPrompt = BiometricPrompt(
  this,
  executor,
  object : BiometricPrompt.AuthenticationCallback() {
    override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
      // Handle error codes
      when (errorCode) {
        BiometricPrompt.ERROR_CANCELED -> showMessage("Biometric canceled")
        BiometricPrompt.ERROR_NO_BIOMETRICS -> showMessage("No biometric enrolled")
        else -> showMessage("Biometric error: $errString")
      }
    }

    override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
      // Proceed with login
      val cipher = result.cryptoObject?.cipher
      if (cipher != null) {
        proceedWithLogin()
      }
    }

    override fun onAuthenticationFailed() {
      showMessage("Biometric authentication failed")
    }
  }
)
```

---

### HIGH Issues

#### 38. **No Input Validation on Transaction Creation**
**File:** [mobile/app/src/main/java/com/finlo/app/ui/transactions/TransactionsViewModel.kt](mobile/app/src/main/java/com/finlo/app/ui/transactions/TransactionsViewModel.kt#L50-L65)  
**Issue:**

```kotlin
fun createTransaction(req: TransactionCreateRequest, onDone: () -> Unit) {
  viewModelScope.launch {
    try {
      api.createTransaction(req)  // ← No validation of req fields
      load()
      onDone()
    } catch (_: Exception) {}  // ← Silent fail!
  }
}
```

**Problems:**
1. No frontend validation of amount, merchant, category before sending.
2. Silent exception swallowing.
3. No error callback to UI.

**Fix:**
```kotlin
data class TransactionsUiState(
  val loading: Boolean = true,
  val transactions: List<TransactionDto> = emptyList(),
  val error: String? = null,
  val searchQuery: String = "",
  val filterCategory: String = "",
)

fun createTransaction(req: TransactionCreateRequest, onDone: () -> Unit) {
  // Validate input
  if (req.merchant.isBlank()) {
    _state.value = _state.value.copy(error = "Merchant is required")
    return
  }
  if (req.amount <= 0) {
    _state.value = _state.value.copy(error = "Amount must be greater than 0")
    return
  }

  viewModelScope.launch {
    _state.value = _state.value.copy(loading = true, error = null)
    try {
      api.createTransaction(req)
      load()
      _state.value = _state.value.copy(loading = false)
      onDone()
    } catch (e: retrofit2.HttpException) {
      _state.value = _state.value.copy(loading = false, error = e.message())
    } catch (e: Exception) {
      _state.value = _state.value.copy(loading = false, error = "Failed to create transaction")
    }
  }
}
```

---

#### 39. **No Logout Cleanup**
**File:** [mobile/app/src/main/java/com/finlo/app/](mobile/app/src/main/java/com/finlo/app/)  
**Issue:** (Inferred) No mention of clearing cached data, stopping WorkManager jobs, or closing database connections on logout. Memory leaks and data retention risk.

**Fix:**
```kotlin
class AuthViewModel @Inject constructor(
  private val api: FinloApi,
  private val tokenManager: TokenManager,
  @ApplicationContext private val context: Context,
) : ViewModel() {
  
  fun logout() {
    viewModelScope.launch {
      try {
        // Cancel pending requests
        api.cancelAll()  // If API supports this
        
        // Clear tokens
        tokenManager.clear()
        
        // Cancel any WorkManager jobs
        WorkManager.getInstance(context).cancelAllWork()
        
        // Clear local database cache
        // (Assuming Room DB exists)
        
        _state.value = AuthUiState(success = false)
      } catch (e: Exception) {
        Log.e("AuthViewModel", "Logout error", e)
      }
    }
  }
}
```

---

#### 40. **No Feature Flag Support**
**File:** [mobile/app/src/main/java/com/finlo/app/](mobile/app/src/main/java/com/finlo/app/)  
**Issue:** (Inferred) App doesn't mention feature flags for graceful degradation (e.g., if ML Kit OCR fails, fall back to manual entry).

**Fix:** Implement feature flag service:
```kotlin
@Singleton
class FeatureFlags @Inject constructor() {
  fun isOcrEnabled(): Boolean = BuildConfig.FLAVOR == "production"
  fun isBiometricEnabled(): Boolean = Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
  fun isAnalyticsEnabled(): Boolean = !BuildConfig.DEBUG
}

// Usage:
if (featureFlags.isOcrEnabled()) {
  startOcr()
} else {
  showManualEntryForm()
}
```

---

### MEDIUM Issues

#### 41. **No Offline Support or Caching**
**File:** [mobile/app/src/main/java/com/finlo/app/](mobile/app/src/main/java/com/finlo/app/)  
**Issue:** App doesn't cache API responses. Going offline = no data access.

**Fix:** Add Room database for caching:
```kotlin
@Entity
data class TransactionCache(
  @PrimaryKey val id: String,
  val userId: String,
  val data: String,  // JSON
  val cachedAt: Long,
)

@Dao
interface TransactionCacheDao {
  @Insert(onConflict = OnConflictStrategy.REPLACE)
  suspend fun insert(vararg transactions: TransactionCache)
  
  @Query("SELECT * FROM transaction_cache WHERE userId = :userId ORDER BY cachedAt DESC")
  fun getCached(userId: String): Flow<List<TransactionCache>>
}

// In repository:
suspend fun getTransactions(userId: String): TransactionListResponse {
  return try {
    val response = api.getTransactions()
    // Cache the response
    response.items.forEach { cacheDao.insert(TransactionCache(it.id, userId, json.encode(it), System.currentTimeMillis())) }
    response
  } catch (e: IOException) {
    // Fallback to cache
    val cached = cacheDao.getCached(userId).first()
    TransactionListResponse(items = cached.map { json.decode(it.data) }, ...)
  }
}
```

---

#### 42. **No Certificate Pinning**
**File:** [mobile/app/src/main/java/com/finlo/app/di/AppModule.kt](mobile/app/src/main/java/com/finlo/app/di/AppModule.kt#L30-L55)  
**Issue:** (Inferred from CLAUDE.md that certificate pinning is planned) Not yet implemented.

**Fix:**
```kotlin
@Provides
@Singleton
fun provideOkHttp(tokenManager: TokenManager): OkHttpClient {
  val certificatePinner = CertificatePinner.Builder()
    .add("api.finlo.app", "sha256/...base64PublicKeyHash...")
    .build()

  return OkHttpClient.Builder()
    .addInterceptor(authInterceptor)
    .addInterceptor(logging)
    .certificatePinner(certificatePinner)
    .connectTimeout(15, TimeUnit.SECONDS)
    .readTimeout(30, TimeUnit.SECONDS)
    .build()
}
```

---

#### 43. **No Proguard/R8 Configuration**
**File:** [mobile/app/proguard-rules.pro](mobile/app/proguard-rules.pro)  
**Issue:** (Inferred) If not properly configured, token manager, API client, or models could be obfuscated incorrectly, causing reflection-based serialization to fail at runtime.

**Fix:** Ensure rules.pro includes:
```proguard
# Retrofit
-keep interface com.finlo.app.data.remote.api.FinloApi
-keep class com.finlo.app.data.remote.dto.** { *; }
-keep class kotlinx.serialization.** { *; }

# Hilt
-keep class **.Hilt_* { *; }
-keep class **_Factory { *; }

# App-specific
-keep class com.finlo.app.util.TokenManager { *; }
-keep class com.finlo.app.** { public *; }

# Keep line numbers for crash reporting
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile
```

---

### LOW Issues

#### 44. **No Request ID Tracking**
**File:** [mobile/app/src/main/java/com/finlo/app/di/AppModule.kt](mobile/app/src/main/java/com/finlo/app/di/AppModule.kt#L30-L55)  
**Issue:** No `X-Request-ID` header sent with requests → cannot trace requests server-side.

**Fix:**
```kotlin
val requestIdInterceptor = Interceptor { chain ->
  val requestId = UUID.randomUUID().toString()
  val request = chain.request().newBuilder()
    .addHeader("X-Request-ID", requestId)
    .build()
  chain.proceed(request)
}

.addInterceptor(requestIdInterceptor)
```

---

#### 45. **Debug Logging Still Enabled**
**File:** [mobile/app/src/main/java/com/finlo/app/di/AppModule.kt](mobile/app/src/main/java/com/finlo/app/di/AppModule.kt#L43-L48)  
**Issue:**

```kotlin
val logging = HttpLoggingInterceptor().apply {
  level = if (BuildConfig.DEBUG) HttpLoggingInterceptor.Level.BODY
      else HttpLoggingInterceptor.Level.NONE
}
```

While this only logs in DEBUG builds, if app is accidentally built in DEBUG mode for release, request bodies (containing passwords, tokens) are logged.

**Fix:**
```kotlin
val logging = HttpLoggingInterceptor().apply {
  level = when {
    BuildConfig.DEBUG && BuildConfig.FLAVOR == "debug" -> HttpLoggingInterceptor.Level.BODY
    else -> HttpLoggingInterceptor.Level.NONE
  }
}.apply {
  setLevel(level)  // Ensure it's truly disabled in production
}
```

---

---

## SUMMARY TABLE

| # | Severity | Component | Category | Issue | File | Fix Difficulty |
|--|--|--|--|--|--|--|
| 1 | CRITICAL | Backend | Validation | Unvalidated user input in receipt upload | receipts.py#L60 | Medium |
| 2 | CRITICAL | Backend | Error Handling | Missing null check in transaction PATCH | transactions.py#L135 | Low |
| 3 | CRITICAL | Backend | Validation | SQL injection-like date filter risk | transactions.py#L105 | Low |
| 4 | CRITICAL | Backend | Security | Auth token exposure in errors | dependencies.py#L40 | Low |
| 5 | HIGH | Backend | Validation | Unsanitized filename in upload | receipts.py#L87 | Low |
| 6 | HIGH | Backend | Null Safety | Missing null check on user settings | receipts.py#L87 | Low |
| 7 | HIGH | Backend | Error Handling | Unhandled exception in OCR parser | parser.py#L60 | Medium |
| 8 | HIGH | Backend | Audit | No audit logging for financial ops | transactions.py | High |
| 9 | HIGH | Backend | Auth | Race condition in token refresh | auth.py#L367 | High |
| 10 | HIGH | Backend | Error Handling | Overly broad exception catching | auth.py#L424 | Low |
| 11 | HIGH | Backend | Security | Missing expense encryption | transactions.py#L60 | Medium |
| 12 | MEDIUM | Backend | Auth | Weak OTP validation timing attack | auth.py#L455 | Low |
| 13 | MEDIUM | Backend | Auth | No rate limiting on auth | auth.py#L130 | Low |
| 14 | MEDIUM | Backend | Validation | Weak password validation | auth.py#L160 | Low |
| 15 | MEDIUM | Backend | Security | Missing CSRF protection | main.py#L50 | Medium |
| 16 | MEDIUM | Backend | Security | Hardcoded encryption keys | config.py#L50 | Low |
| 17 | LOW | Backend | Serialization | Loose JSON schema | budgets.py#L50 | Low |
| 18 | LOW | Backend | Logging | Logging may expose data | logging.py#L50 | Low |
| 19 | CRITICAL | Frontend | Error Handling | Unhandled promise in dashboard | Dashboard.tsx#L45 | Low |
| 20 | CRITICAL | Frontend | Auth | Token refresh loop / infinite retry | api.ts#L40 | Medium |
| 21 | CRITICAL | Frontend | UX | Missing form submission error state | AuthForm.tsx#L60 | Low |
| 22 | HIGH | Frontend | Error Handling | Unhandled upload errors | Upload.tsx#L10 | Medium |
| 23 | HIGH | Frontend | Error Handling | Missing error boundary | Dashboard.tsx#L1 | Low |
| 24 | HIGH | Frontend | Security | XSS risk in dynamic styles | Budgets.tsx#L100 | Low |
| 25 | HIGH | Frontend | Context | Missing null check on useAuth | Transactions.tsx#L50 | Low |
| 26 | MEDIUM | Frontend | Validation | Form validation not enforced on backend | AuthForm.tsx#L40 | Low |
| 27 | MEDIUM | Frontend | UX | Missing refetch on window focus | Dashboard.tsx#L45 | Low |
| 28 | MEDIUM | Frontend | Security | PIN hashing vulnerability | SessionLock.tsx#L6 | Low |
| 29 | LOW | Frontend | Config | Hardcoded API URL | api.ts#L1 | Low |
| 30 | LOW | Frontend | Logging | Console logging in production | pages/**/*.tsx | Low |
| 31 | CRITICAL | Mobile | Error Handling | Bare exception catching in ViewModels | AuthViewModel.kt#L35 | Low |
| 32 | CRITICAL | Mobile | Security | Token stored without encryption verify | TokenManager.kt#L30 | Low |
| 33 | CRITICAL | Mobile | Network | No network timeout configuration | AppModule.kt#L30 | Low |
| 34 | HIGH | Mobile | Error Handling | No retry logic for API failures | TransactionsViewModel.kt#L20 | Medium |
| 35 | HIGH | Mobile | Auth | No biometric cancellation handling | (inferred) | Medium |
| 36 | HIGH | Mobile | Validation | No input validation on creation | TransactionsViewModel.kt#L50 | Low |
| 37 | HIGH | Mobile | Auth | No logout cleanup | (inferred) | Low |
| 38 | HIGH | Mobile | Feature | No feature flag support | (inferred) | Medium |
| 39 | MEDIUM | Mobile | Caching | No offline support or caching | (inferred) | High |
| 40 | MEDIUM | Mobile | Security | No certificate pinning | AppModule.kt#L30 | Medium |
| 41 | MEDIUM | Mobile | Obfuscation | No Proguard/R8 configuration | proguard-rules.pro | Medium |
| 42 | LOW | Mobile | Observability | No request ID tracking | AppModule.kt#L30 | Low |
| 43 | LOW | Mobile | Logging | Debug logging still enabled | AppModule.kt#L43 | Low |

---

## Recommendations (Priority Order)

### Phase 1 (Immediate - Week 1)
- **#1, #2, #3, #4**: Input validation & null checks (Backend)
- **#19, #20, #21**: Dashboard & auth error handling (Frontend)
- **#31, #33, #34**: Exception handling & network (Mobile)

### Phase 2 (Short-term - Week 2-3)
- **#8**: Audit logging for financial operations
- **#22, #23, #24**: Upload errors & error boundaries
- **#11**: Encrypt expenses server-side
- **#32, #35, #36, #37**: Mobile error handling & cleanup

### Phase 3 (Medium-term - Month 2)
- **#9, #12, #13, #14, #15**: Auth + CSRF + password strength  
- **#39, #40, #41**: Mobile caching, cert pinning, obfuscation
- **#25, #26, #27, #28**: Frontend validation & UX improvements

### Phase 4 (Long-term)
- **#6, #16, #18, #30**: Logging, configuration, env management

---

## Testing Recommendations

1. **Integration tests** for error paths (401, 422, 500 responses)
2. **E2E tests** for form submission with network failures
3. **Load tests** on auth endpoints (OTP, refresh)
4. **Security tests**: SQL injection, XSS, CSRF, timing attacks
5. **Mobile tests**: Offline mode, network timeout, biometric cancellation
6. **Fuzz testing** on receipt OCR parser

---

## Security Benchmarks Met

✅ Encryption at rest (Keystore, EncryptedSharedPreferences)  
✅ Encryption in transit (TLS)  
✅ Auth token handling (short-lived JWT + refresh)  
✅ Rate limiting (global 60/min)  
✅ OWASP security headers (CSP, HSTS, X-Frame-Options)  
✅ RLS on database  
❌ Audit logging (missing)  
❌ Input validation (inconsistent)  
❌ Error handling (poor in production)  

---

**Overall Assessment:** Finlo has strong foundational security but needs significant hardening of error handling, input validation, and operational concerns before public release.
