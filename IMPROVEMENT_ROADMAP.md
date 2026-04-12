# Finlo — Detailed Improvement Roadmap
## Using Free Tier Services & Open-Source Solutions

**Generated:** April 2026  
**Purpose:** Actionable improvement recommendations with free tools and zero-cost implementations

---

## 📋 Executive Roadmap

### Phase 1: Blocking Issues (Week 1) — **FREE**
- ✅ Input validation (Pydantic, JSDoc, Kotlin DSL)
- ✅ Error handling & user feedback (built-in frameworks)
- ✅ Network timeout & exception handling
- ✅ Token refresh fix
- **Cost:** $0 | **Effort:** 12-16 hours

### Phase 2: Financial Integrity (Weeks 2-3) — **FREE**
- ✅ Audit logging (PostgreSQL triggers)
- ✅ Server-side encryption (pgcrypto, already in schema!)
- ✅ Upload error recovery
- ✅ Mobile cleanup & caching (Room DB, WorkManager)
- **Cost:** $0 | **Effort:** 20-24 hours

### Phase 3: Authentication Hardening (Month 2) — **FREE + $0-5/mo optional**
- ✅ Rate limiting (Slowapi, OkHttp interceptor)
- ✅ Password strength validation
- ✅ CSRF protection (FastAPI-CSRF-Protect)
- ✅ Timing-safe OTP comparison (hmac library)
- ✅ Optional: Free tier Brevo/MailerSend for OTP delivery testing
- **Cost:** $0-5 | **Effort:** 12-16 hours

### Phase 4: Resilience & Observability (Month 2-3) — **FREE tier Sentry/PostHog**
- ✅ Offline support & caching (Room DB, Workbox, IndexedDB)
- ✅ Certificate pinning (OkHttp library)
- ✅ Request tracing (UUID headers)
- ✅ Error logging (Sentry free tier: 5k events/month)
- ✅ Analytics (PostHog free tier: unlimited events/user)
- **Cost:** $0 (free tiers) | **Effort:** 24-32 hours

---

---

# DETAILED FREE TIER IMPLEMENTATION GUIDE

---

## PHASE 1: INPUT VALIDATION & ERROR HANDLING

### 1.1 Backend — Pydantic Input Validation (FREE)
**Source:** [pydantic-core](https://github.com/pydantic/pydantic) (Apache 2.0)

**Problem:** Receipt upload, transaction updates, date filters accept invalid input without validation.

**Solution:** Add Pydantic models for ALL endpoints.

**Implementation (Code):**
```python
# backend/app/api/schemas.py
from pydantic import BaseModel, Field, EmailStr, field_validator, ValidationError
from datetime import datetime
from typing import Optional, List

class ClientOCRData(BaseModel):
    lines: List[str] = Field(..., min_items=1, max_items=50)
    confidence: float = Field(..., ge=0.0, le=1.0)
    merchant: Optional[str] = Field(None, max_length=200)
    total: Optional[float] = Field(None, ge=0)
    
    @field_validator('lines')
    @classmethod
    def validate_lines(cls, v):
        for line in v:
            if len(line) > 500:
                raise ValueError("Line too long (max 500 chars)")
        return v

class TransactionUpdate(BaseModel):
    amount: Optional[float] = Field(None, gt=0)
    merchant: Optional[str] = Field(None, max_length=200)
    category_id: Optional[str] = Field(None, min_length=36, max_length=36)  # UUID
    date: Optional[datetime] = None
    
    @field_validator('merchant')
    @classmethod
    def sanitize_merchant(cls, v):
        if v:
            return v.strip()[:200]  # Prevent injection
        return v

class DateRangeFilter(BaseModel):
    date_from: Optional[str] = Field(None, pattern=r'^\d{4}-\d{2}-\d{2}$')
    date_to: Optional[str] = Field(None, pattern=r'^\d{4}-\d{2}-\d{2}$')
    
    @field_validator('date_from', 'date_to')
    @classmethod
    def validate_iso_date(cls, v):
        if v:
            try:
                datetime.fromisoformat(v)
            except ValueError:
                raise ValueError("Must be ISO format (YYYY-MM-DD)")
        return v

# backend/app/api/receipts.py
from fastapi import HTTPException, status
from app.api.schemas import ClientOCRData

@router.post("/upload")
async def upload_receipt(
    file: UploadFile,
    parsed_json: Optional[str] = None,
    client_side_ocr: bool = False,
    current_user: CurrentUser = Depends(get_current_user),
    db: DB = Depends(),
):
    """Upload receipt with strict validation"""
    
    # Validate file
    if file.filename and len(file.filename) > 256:
        raise HTTPException(status_code=422, detail="Filename too long")
    
    # Validate parsed JSON schema
    if client_side_ocr and parsed_json:
        try:
            client_data = ClientOCRData(**json.loads(parsed_json))
        except json.JSONDecodeError as e:
            raise HTTPException(status_code=422, detail=f"Invalid JSON: {e.msg}")
        except ValidationError as e:
            raise HTTPException(status_code=422, detail=f"Invalid OCR data: {e.errors()[0]['msg']}")
    
    # Sanitize filename
    safe_filename = sanitize_filename(file.filename)
    
    # ... rest of upload logic
```

**Estimated Effort:** 4 hours  
**Priority:** CRITICAL  
**Free Cost:** $0 (Pydantic is built into FastAPI)

---

### 1.2 Frontend — TypeScript Validation (FREE)
**Source:** [Zod](https://github.com/colinhacks/zod) or [io-ts](https://github.com/gcanti/io-ts) (MIT)

**Problem:** Frontend validates passwords, but backend doesn't enforce same rules.

**Solution:** Shared validation schemas.

**Implementation:**
```typescript
// frontend/src/schemas.ts
import { z } from 'zod';

export const PasswordSchema = z.string()
  .min(10, 'Password must be at least 10 characters')
  .regex(/[0-9]{2,}/, 'Must contain at least 2 digits')
  .regex(/[a-zA-Z]/, 'Must contain at least 1 letter');

export const TransactionSchema = z.object({
  merchant: z.string().min(1, 'Merchant required').max(200),
  amount: z.number().positive('Amount must be positive'),
  category_id: z.string().uuid('Invalid category'),
  date: z.date(),
  tags: z.array(z.string()).optional(),
});

// frontend/src/pages/AuthForm.tsx
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';

const SignupSchema = z.object({
  email: z.string().email('Invalid email'),
  password: PasswordSchema,
  confirm_password: z.string(),
}).refine((data) => data.password === data.confirm_password, {
  message: "Passwords don't match",
  path: ["confirm_password"],
});

export function AuthForm() {
  const { register, formState: { errors }, handleSubmit } = useForm({
    resolver: zodResolver(SignupSchema),
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <input {...register('password')} />
      {errors.password && <span>{errors.password.message}</span>}
    </form>
  );
}
```

**Estimated Effort:** 3 hours  
**Priority:** CRITICAL  
**Free Cost:** $0

---

### 1.3 Mobile — Kotlin Input Validation (FREE)
**Source:** [Valiktor](https://github.com/valiktor/valiktor) or [Konval](https://github.com/konform-kt/konform) (Apache 2.0)

**Problem:** Mobile ViewModels accept user input without validation.

**Solution:** Inline validation + type safety.

**Implementation:**
```kotlin
// mobile/app/src/main/java/com/finlo/app/data/validation/Validations.kt
sealed class ValidationResult<T> {
    data class Success<T>(val data: T) : ValidationResult<T>()
    data class Error<T>(val message: String) : ValidationResult<T>()
}

fun validateTransactionCreate(
    merchant: String,
    amount: Double,
    categoryId: String,
): ValidationResult<TransactionCreateRequest> {
    return when {
        merchant.isBlank() -> ValidationResult.Error("Merchant is required")
        merchant.length > 200 -> ValidationResult.Error("Merchant too long")
        amount <= 0 -> ValidationResult.Error("Amount must be positive")
        categoryId.isBlank() -> ValidationResult.Error("Category required")
        else -> ValidationResult.Success(
            TransactionCreateRequest(
                merchant = merchant.trim(),
                amount = amount,
                categoryId = categoryId,
            )
        )
    }
}

// mobile/app/src/main/java/com/finlo/app/ui/transactions/TransactionsViewModel.kt
fun createTransaction(merchant: String, amount: Double, categoryId: String) {
    when (val result = validateTransactionCreate(merchant, amount, categoryId)) {
        is ValidationResult.Error -> {
            _state.value = _state.value.copy(error = result.message)
        }
        is ValidationResult.Success -> {
            viewModelScope.launch {
                try {
                    api.createTransaction(result.data)
                    load()
                } catch (e: Exception) {
                    _state.value = _state.value.copy(error = "Failed to create transaction")
                }
            }
        }
    }
}
```

**Estimated Effort:** 3 hours  
**Priority:** CRITICAL  
**Free Cost:** $0

---

### 1.4 Error Handling — User-Friendly Messages (FREE)

**Backend (FastAPI):**
```python
# backend/app/api/exceptions.py
from fastapi import HTTPException, status
from typing import Optional, Dict, Any

class FinloException(HTTPException):
    """Base app exception with user-friendly message"""
    def __init__(
        self, 
        status_code: int, 
        detail: str,
        user_message: Optional[str] = None,
        code: Optional[str] = None,
    ):
        self.user_message = user_message or detail
        self.code = code
        super().__init__(status_code=status_code, detail=detail)

class ValidationError(FinloException):
    def __init__(self, detail: str, code: str = "VALIDATION_ERROR"):
        super().__init__(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=detail,
            code=code,
        )

class ResourceNotFound(FinloException):
    def __init__(self, resource: str):
        super().__init__(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"{resource} not found",
            user_message=f"Sorry, we couldn't find that {resource.lower()}.",
            code="NOT_FOUND",
        )

class InvalidCredentials(FinloException):
    def __init__(self):
        super().__init__(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
            user_message="The email or password you entered is incorrect.",
            code="INVALID_CREDENTIALS",
        )

# backend/app/main.py
from fastapi.responses import JSONResponse
from app.api.exceptions import FinloException

@app.exception_handler(FinloException)
async def finlo_exception_handler(request, exc: FinloException):
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "status": "error",
            "code": exc.code or "UNKNOWN",
            "detail": exc.detail,
            "user_message": exc.user_message,  # ← Safe for display
        },
    )

@app.exception_handler(ValueError)
async def value_error_handler(request, exc: ValueError):
    return JSONResponse(
        status_code=422,
        content={
            "status": "error",
            "code": "VALIDATION_ERROR",
            "detail": str(exc),
            "user_message": "Invalid data provided. Please check your input and try again.",
        },
    )

# backend/app/api/auth.py
@router.post("/auth/signin")
async def signin(body: SigninRequest, db: DB) -> AuthResponse:
    user = await db.get_user_by_email(body.email)
    if not user or not pwd_context.verify(body.password, user.password_hash):
        raise InvalidCredentials()  # ← User-friendly message
    
    # ... create tokens and return
```

**Frontend (React):**
```typescript
// frontend/src/services/api.ts
interface ErrorResponse {
  status: "error";
  code: string;
  detail: string;
  user_message?: string;
}

api.interceptors.response.use(
  response => response,
  async (error) => {
    const data: ErrorResponse = error.response?.data;
    
    // Use user_message if available, fallback to detail
    const userMessage = data?.user_message || data?.detail || 'Something went wrong. Please try again.';
    
    // Store for display
    error.userMessage = userMessage;
    error.code = data?.code;
    
    return Promise.reject(error);
  }
);

// frontend/src/components/ErrorDisplay.tsx
export function ErrorDisplay({ error }: { error: any }) {
  return (
    <div className="bg-red-50 border border-red-200 rounded-lg p-4">
      <p className="text-red-700 font-medium">{error.userMessage}</p>
      {error.code && (
        <p className="text-red-600 text-sm mt-1">Error code: {error.code}</p>
      )}
    </div>
  );
}

// frontend/src/pages/AuthForm.tsx
const onSubmit = async (data: FormData) => {
  setError('');
  try {
    const response = await api.post('/auth/signin', data);
    setAuth(response.data);
  } catch (err: any) {
    // Error handler above sets err.userMessage
    setError(err.userMessage);
  }
};
```

**Mobile (Kotlin):**
```kotlin
// mobile/app/src/main/java/com/finlo/app/util/ErrorHandler.kt
sealed class AppError(val userMessage: String, val code: String) {
    class NetworkError : AppError("Check your connection and try again", "NETWORK_ERROR")
    class Unauthorized : AppError("Please sign in again", "UNAUTHORIZED")
    class ValidationError(detail: String) : AppError(detail, "VALIDATION_ERROR")
    class ServerError : AppError("Something went wrong. Please try again", "SERVER_ERROR")
    class Unknown(detail: String) : AppError(detail, "UNKNOWN_ERROR")
}

fun handleApiError(exception: Throwable): AppError {
    return when (exception) {
        is CancellationException -> throw exception
        is java.io.IOException -> AppError.NetworkError()
        is retrofit2.HttpException -> {
            when (exception.code()) {
                401 -> AppError.Unauthorized()
                422 -> AppError.ValidationError(exception.response()?.errorBody()?.string() ?: "Invalid data")
                500, 502, 503 -> AppError.ServerError()
                else -> AppError.Unknown(exception.message())
            }
        }
        else -> AppError.Unknown(exception.message ?: "Unexpected error")
    }
}

// mobile/app/src/main/java/com/finlo/app/ui/auth/AuthViewModel.kt
fun login(email: String, password: String) {
    viewModelScope.launch {
        _state.value = _state.value.copy(loading = true, error = null)
        try {
            val res = api.signin(SigninRequest(email, password))
            tokenManager.accessToken = res.accessToken
            _state.value = _state.value.copy(loading = false, success = true)
        } catch (e: Exception) {
            val appError = handleApiError(e)
            _state.value = _state.value.copy(loading = false, error = appError.userMessage)
        }
    }
}
```

**Estimated Effort:** 5 hours  
**Priority:** CRITICAL  
**Free Cost:** $0

---

### 1.5 Token Refresh Fix (FREE)

**Frontend Fix:**
```typescript
// frontend/src/services/api.ts
let refreshPromise: Promise<string> | null = null;
const MAX_RETRIES = 1;

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    const retryCount = (originalRequest._retryCount || 0);

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
        window.location.href = '/login';
        return Promise.reject(error);
      }

      try {
        if (!refreshPromise) {
          refreshPromise = axios
            .post(`${API_URL}/auth/refresh`, { refresh_token: refreshToken }, { timeout: 5000 })
            .then((res) => {
              const { access_token, refresh_token: newRefresh } = res.data;
              setStoredTokens(access_token, newRefresh);
              return access_token;
            })
            .catch((refreshError) => {
              clearStoredTokens();
              window.location.href = '/login';
              throw refreshError;
            })
            .finally(() => { refreshPromise = null; });
        }

        const newAccessToken = await refreshPromise;
        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        return api(originalRequest);
      } catch {
        return Promise.reject(error);  // Don't retry again
      }
    }

    if (error.response?.status === 401) {
      clearStoredTokens();
      window.location.href = '/login';
    }

    return Promise.reject(error);
  }
);
```

**Estimated Effort:** 2 hours  
**Priority:** CRITICAL  
**Free Cost:** $0

---

### 1.6 Network Timeouts & Exception Handling (FREE)

**Mobile (OkHttp):**
```kotlin
@Provides
@Singleton
fun provideOkHttp(): OkHttpClient {
  return OkHttpClient.Builder()
    .connectTimeout(15, TimeUnit.SECONDS)
    .readTimeout(30, TimeUnit.SECONDS)
    .writeTimeout(30, TimeUnit.SECONDS)
    .callTimeout(60, TimeUnit.SECONDS)
    .retryOnConnectionFailure(true)
    .build()
}
```

**Mobile (Exception Handling):**
```kotlin
fun login(email: String, password: String) {
    viewModelScope.launch {
        _state.value = _state.value.copy(loading = true, error = null)
        try {
            val res = api.signin(SigninRequest(email, password))
            tokenManager.accessToken = res.accessToken
            _state.value = _state.value.copy(loading = false, success = true)
        } catch (e: CancellationException) {
            throw e  // Re-throw cancellation
        } catch (e: retrofit2.HttpException) {
            val errorMsg = when (e.code()) {
                401 -> "Invalid email or password"
                409 -> "Email already registered"
                503 -> "Service unavailable"
                else -> "Authentication failed"
            }
            _state.value = _state.value.copy(loading = false, error = errorMsg)
        } catch (e: java.io.IOException) {
            // Network error
            _state.value = _state.value.copy(loading = false, error = "Check your connection")
        } catch (e: Exception) {
            // Unexpected
            _state.value = _state.value.copy(loading = false, error = "Please try again")
        }
    }
}
```

**Estimated Effort:** 3 hours  
**Priority:** CRITICAL  
**Free Cost:** $0

---

## PHASE 2: AUDIT LOGGING & ENCRYPTION

### 2.1 Audit Logging (FREE)
**Source:** PostgreSQL Triggers + native SQL (built-in, no cost)

**Problem:** No financial operation audit trail → GDPR risk.

**Solution:** PostgreSQL triggers + audit table.

**Implementation:**
```sql
-- supabase/migrations/20260410_add_audit_logging.sql

-- Create audit log table
CREATE TABLE audit_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,  -- 'create_transaction', 'delete_budget', etc
    table_name TEXT NOT NULL,
    record_id uuid NOT NULL,
    old_values JSONB,  -- Before state
    new_values JSONB,  -- After state
    changed_fields TEXT[] DEFAULT '{}',
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    ip_address INET,
    user_agent TEXT
);

CREATE INDEX idx_audit_user ON audit_logs(user_id, created_at DESC);
CREATE INDEX idx_audit_action ON audit_logs(action, created_at DESC);

-- Create trigger function for transactions
CREATE OR REPLACE FUNCTION audit_transaction_changes()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO audit_logs (
        user_id,
        action,
        table_name,
        record_id,
        old_values,
        new_values,
        changed_fields
    ) VALUES (
        COALESCE(NEW.user_id, OLD.user_id),
        TG_ARGV[0],  -- 'INSERT', 'UPDATE', 'DELETE'
        'transactions',
        COALESCE(NEW.id, OLD.id),
        CASE WHEN TG_OP = 'DELETE' OR TG_OP = 'UPDATE' THEN row_to_json(OLD) ELSE NULL END,
        CASE WHEN TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN row_to_json(NEW) ELSE NULL END,
        CASE WHEN TG_OP = 'UPDATE' THEN
            (SELECT array_agg(key) FROM jsonb_each(row_to_json(NEW)) k 
             WHERE row_to_json(OLD) ->> k.key IS DISTINCT FROM row_to_json(NEW) ->> k.key)
        ELSE '{}' END
    );
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Attach trigger to transactions table
CREATE TRIGGER transaction_audit_insert
AFTER INSERT ON transactions
FOR EACH ROW EXECUTE FUNCTION audit_transaction_changes('INSERT');

CREATE TRIGGER transaction_audit_update
AFTER UPDATE ON transactions
FOR EACH ROW EXECUTE FUNCTION audit_transaction_changes('UPDATE');

CREATE TRIGGER transaction_audit_delete
BEFORE DELETE ON transactions
FOR EACH ROW EXECUTE FUNCTION audit_transaction_changes('DELETE');

-- Enable RLS on audit logs
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own audit logs"
ON audit_logs FOR SELECT
USING (auth.uid() = user_id);
```

**Backend access to audit logs:**
```python
# backend/app/api/admin.py
from app.db.models import AuditLog

@router.get("/user/{user_id}/audit")
async def get_user_audit_log(
    user_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: DB = Depends(),
):
    """Get audit log for a user (admin only)"""
    if current_user.id != user_id and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Forbidden")
    
    result = await db.execute(
        select(AuditLog)
        .where(AuditLog.user_id == user_id)
        .order_by(AuditLog.created_at.desc())
        .limit(1000)
    )
    return result.scalars().all()
```

**Estimated Effort:** 4 hours  
**Priority:** HIGH  
**Free Cost:** $0

---

### 2.2 Server-Side Encryption (Already in Schema!) (FREE)
**Source:** PostgreSQL pgcrypto (built-in, no cost)

**Problem:** Amounts, merchants not encrypted per CLAUDE.md spec.

**Solution:** Enable pgcrypto + encrypt sensitive fields.

**Implementation:**
```sql
-- Enable pgcrypto (if not already done)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Update transactions table to store encrypted amounts
ALTER TABLE transactions
ADD COLUMN amount_encrypted TEXT,
ADD COLUMN merchant_encrypted TEXT,
ADD COLUMN notes_encrypted TEXT;

-- Create encryption key (per user from PIN/password)
-- Note: In practice, the key is derived server-side from a master key
-- This is handled in the app server, not in SQL

-- Update function to encrypt on insert
CREATE OR REPLACE FUNCTION encrypt_transaction_fields()
RETURNS TRIGGER AS $$
DECLARE
    master_key TEXT := current_setting('app.encryption_key');
BEGIN
    NEW.amount_encrypted := pgp_sym_encrypt(
        CAST(NEW.amount AS TEXT),
        master_key,
        'cipher-algo=aes256'
    );
    NEW.merchant_encrypted := pgp_sym_encrypt(
        NEW.merchant,
        master_key,
        'cipher-algo=aes256'
    );
    NEW.notes_encrypted := pgp_sym_encrypt(
        COALESCE(NEW.notes, ''),
        master_key,
        'cipher-algo=aes256'
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER encrypt_on_insert
BEFORE INSERT ON transactions
FOR EACH ROW EXECUTE FUNCTION encrypt_transaction_fields();

CREATE TRIGGER encrypt_on_update
BEFORE UPDATE ON transactions
FOR EACH ROW EXECUTE FUNCTION encrypt_transaction_fields();
```

**Backend implementation:**
```python
# backend/app/services/encryption.py
from cryptography.fernet import Fernet
from app.config import settings
import base64

class EncryptionService:
    def __init__(self):
        # In production, derive from KMS or environment
        self.cipher_suite = Fernet(settings.PII_ENCRYPTION_KEY.encode())
    
    def encrypt(self, plaintext: str) -> str:
        """Encrypt a string"""
        return self.cipher_suite.encrypt(plaintext.encode()).decode()
    
    def decrypt(self, ciphertext: str) -> str:
        """Decrypt a string"""
        return self.cipher_suite.decrypt(ciphertext.encode()).decode()

# backend/app/api/transactions.py
@router.post("/transactions", response_model=TransactionOut)
async def create_transaction(
    body: TransactionCreate,
    current_user: CurrentUser = Depends(get_current_user),
    db: DB = Depends(),
    encryption: EncryptionService = Depends(),
):
    """Create transaction with encryption"""
    txn = Transaction(
        user_id=current_user.id,
        date=body.date,
        merchant=encryption.encrypt(body.merchant),  # ← Encrypted
        amount=encryption.encrypt(str(body.amount)),  # ← Encrypted
        notes=encryption.encrypt(body.notes or ''),   # ← Encrypted
        category_id=body.category_id,
        payment_mode=body.payment_mode,
    )
    db.add(txn)
    await db.commit()
    return txn

@router.get("/transactions", response_model=List[TransactionOut])
async def list_transactions(
    current_user: CurrentUser = Depends(get_current_user),
    db: DB = Depends(),
    encryption: EncryptionService = Depends(),
):
    """List transactions (decrypt on retrieval)"""
    result = await db.execute(
        select(Transaction)
        .where(Transaction.user_id == current_user.id)
        .order_by(Transaction.date.desc())
    )
    transactions = result.scalars().all()
    
    # Decrypt on retrieval
    for txn in transactions:
        txn.merchant = encryption.decrypt(txn.merchant)
        txn.amount = float(encryption.decrypt(txn.amount))
        txn.notes = encryption.decrypt(txn.notes)
    
    return transactions
```

**Estimated Effort:** 3 hours  
**Priority:** HIGH  
**Free Cost:** $0

---

### 2.3 Upload Progress & Error Recovery (FREE)

**Frontend:**
```typescript
// frontend/src/pages/Upload.tsx
const [uploading, setUploading] = useState(false);
const [uploadProgress, setUploadProgress] = useState(0);
const [error, setError] = useState('');
const isMountedRef = useRef(true);

useEffect(() => {
  return () => { isMountedRef.current = false; };
}, []);

const onDrop = useCallback(async (acceptedFiles: File[]) => {
  const file = acceptedFiles[0];
  if (!file) return;
  
  if (file.size > 10 * 1024 * 1024) {
    setError('File too large (max 10 MB)');
    return;
  }

  setUploading(true);
  setError('');
  setUploadProgress(0);

  const formData = new FormData();
  formData.append('file', file);
  formData.append('client_side_ocr', clientOcr.toString());

  try {
    const { data } = await api.post('/receipts/upload', formData, {
      timeout: 60000,  // 60 second timeout
      onUploadProgress: (progressEvent: ProgressEvent) => {
        if (isMountedRef.current && progressEvent.total) {
          const percent = Math.round((progressEvent.loaded / progressEvent.total) * 100);
          setUploadProgress(percent);
        }
      },
    });

    if (!isMountedRef.current) return;
    navigate(`/receipts/review/${data.receipt_id}`, {
      state: { parsed: data.parsed, confidence: data.ocr_confidence },
    });
  } catch (err: any) {
    if (!isMountedRef.current) return;

    let errorMsg = 'Upload failed. Please try again.';
    if (err.code === 'ECONNABORTED') {
      errorMsg = 'Upload timed out. Try a smaller file.';
    } else if (err.response?.status === 413) {
      errorMsg = 'File too large (max 10 MB).';
    } else if (err.response?.status === 422) {
      errorMsg = 'Invalid file format. Use JPG or PNG.';
    }
    
    setError(errorMsg);
    setUploading(false);
    setUploadProgress(0);
  }
}, [clientOcr, navigate]);

return (
  <div>
    {uploading && (
      <>
        <div className="w-full h-1 bg-gray-300 rounded">
          <div 
            className="h-full bg-blue-500 transition-all"
            style={{ width: `${uploadProgress}%` }}
          />
        </div>
        <p className="text-sm text-gray-600 mt-2">{uploadProgress}% uploaded</p>
      </>
    )}
    {error && (
      <div className="bg-red-50 border border-red-300 rounded p-3 mt-4">
        <p className="text-red-700">{error}</p>
        <button 
          onClick={() => document.getElementById('upload-input')?.click()}
          className="text-red-600 underline mt-2"
        >
          Try again
        </button>
      </div>
    )}
  </div>
);
```

**Estimated Effort:** 2 hours  
**Priority:** HIGH  
**Free Cost:** $0

---

### 2.4 Mobile Offline Caching (FREE)
**Source:** Room Database + WorkManager (built-in Android libraries)

**Implementation:**
```kotlin
// mobile/app/src/main/java/com/finlo/app/data/local/TransactionCache.kt
@Entity
data class TransactionCache(
    @PrimaryKey val id: String,
    val userId: String,
    val data: String,  // JSON
    val cachedAt: Long,
    val synced: Boolean = false,  // Track sync status
)

@Dao
interface TransactionCacheDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(vararg transactions: TransactionCache)
    
    @Query("SELECT * FROM transaction_cache WHERE userId = :userId ORDER BY cachedAt DESC LIMIT 100")
    fun getCached(userId: String): Flow<List<TransactionCache>>
    
    @Query("DELETE FROM transaction_cache WHERE cachedAt < :ageMs")
    suspend fun deleteOldCache(ageMs: Long)
}

// mobile/app/src/main/java/com/finlo/app/data/repository/TransactionRepository.kt
class TransactionRepository @Inject constructor(
    private val api: FinloApi,
    private val cacheDao: TransactionCacheDao,
) {
    suspend fun getTransactions(userId: String, forceRefresh: Boolean = false): Result<List<TransactionDto>> {
        return try {
            val response = api.getTransactions()
            
            // Cache result
            response.items.forEach { txn ->
                cacheDao.insert(
                    TransactionCache(
                        id = txn.id,
                        userId = userId,
                        data = Json.encodeToString(txn),
                        cachedAt = System.currentTimeMillis(),
                        synced = true,
                    )
                )
            }
            
            Result.success(response.items)
        } catch (e: IOException) {
            // Network error - use cached data
            val cached = cacheDao.getCached(userId).firstOrNull() ?: emptyList()
            if (cached.isNotEmpty()) {
                Result.success(cached.map { Json.decodeFromString<TransactionDto>(it.data) })
            } else {
                Result.failure(e)
            }
        }
    }
}

// mobile/app/src/main/java/com/finlo/app/workers/SyncWorker.kt
class TransactionSyncWorker(
    context: Context,
    params: WorkerParameters,
    private val repo: TransactionRepository,
) : CoroutineWorker(context, params) {
    
    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        return@withContext try {
            val userId = inputData.getString("user_id") ?: return@withContext Result.retry()
            val result = repo.getTransactions(userId, forceRefresh = true)
            
            if (result.isSuccess) {
                Result.success()
            } else {
                Result.retry()
            }
        } catch (e: Exception) {
            Result.retry()
        }
    }
}

// In MainActivity or Application.onCreate():
WorkManager.getInstance(context).enqueuePeriodicWork(
    "transaction_sync",
    PeriodicWorkRequestBuilder<TransactionSyncWorker>(15, TimeUnit.MINUTES).build()
)
```

**Estimated Effort:** 6 hours  
**Priority:** HIGH  
**Free Cost:** $0

---

---

## PHASE 3: AUTHENTICATION HARDENING

### 3.1 Rate Limiting (FREE)
**Source:** [Slowapi](https://github.com/laurentS/slowapi) (MIT) for backend, OkHttp interceptor for mobile

**Backend:**
```python
# backend/app/main.py
from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

limiter = Limiter(key_func=get_remote_address, default_limits=["60/minute"])
app = FastAPI()
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# backend/app/api/auth.py
@router.post("/auth/signin")
@limiter.limit("5/minute")  # Max 5 sign-in attempts per minute per IP
async def signin(request: Request, body: SigninRequest, ...):
    # ... implementation

@router.post("/auth/signup")
@limiter.limit("3/minute")  # Max 3 sign-ups per minute per IP
async def signup(request: Request, body: SignupRequest, ...):
    # ... implementation

@router.post("/auth/otp/request")
@limiter.limit("3/minute")  # OTP requests limited
async def request_otp(request: Request, body: OTPRequest, ...):
    # ... implementation

@router.post("/auth/otp/verify")
@limiter.limit("5/minute")  # OTP verification attempts limited
async def verify_otp(request: Request, body: VerifyOTPRequest, ...):
    # ... implementation
```

**Estimated Effort:** 2 hours  
**Priority:** MEDIUM  
**Free Cost:** $0

---

### 3.2 Password Strength Validation (FREE)

```python
# backend/app/services/password.py
import re
from pydantic import field_validator

def validate_password_strength(password: str) -> bool:
    """Validate password meets security requirements"""
    if len(password) < 10:
        raise ValueError("Password must be at least 10 characters")
    if len(password) > 128:
        raise ValueError("Password must be at most 128 characters")
    if not re.search(r'[a-z]', password):
        raise ValueError("Password must contain lowercase letters")
    if not re.search(r'[A-Z]', password):
        raise ValueError("Password must contain uppercase letters")
    if not re.search(r'[0-9]{2,}', password):
        raise ValueError("Password must contain at least 2 digits")
    if not re.search(r'[!@#$%^&*()_+\-=\[\]{};:\'",.<>?/\\|`~]', password):
        raise ValueError("Password must contain at least 1 special character")
    return True

# backend/app/api/schemas.py
class SignupRequest(BaseModel):
    email: EmailStr
    password: str
    full_name: str
    
    @field_validator('password')
    @classmethod
    def validate_password(cls, v):
        validate_password_strength(v)
        return v
```

**Estimated Effort:** 1 hour  
**Priority:** MEDIUM  
**Free Cost:** $0

---

### 3.3 Timing-Safe OTP Comparison (FREE)
**Source:** Python built-in `hmac` module

```python
# backend/app/api/auth.py
import hmac

@router.post("/auth/otp/verify")
async def verify_otp(body: VerifyOTPRequest, db: DB) -> AuthResponse:
    otp_record = await db.get_otp_token(body.mobile_number)
    
    if not otp_record:
        raise HTTPException(status_code=400, detail="OTP expired")
    
    # Timing-safe comparison (prevents timing attacks)
    if not hmac.compare_digest(otp_record.otp_hash, body.otp):
        raise HTTPException(status_code=400, detail="Invalid OTP")
    
    if otp_record.expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="OTP expired")
    
    # ... create auth tokens
```

**Estimated Effort:** 1 hour  
**Priority:** MEDIUM  
**Free Cost:** $0

---

### 3.4 CSRF Protection (FREE)
**Source:** [fastapi-csrf-protect](https://github.com/ahuigo/fastapi-csrf-protect) (MIT)

```python
# backend/app/main.py
from fastapi_csrf_protect import CsrfProtect

@CsrfProtect.load_config
def load_config():
    return CsrfSettings(secret_key=settings.CSRF_SECRET_KEY)

# backend/app/api/transactions.py
@router.post("/transactions")
async def create_transaction(
    body: TransactionCreate,
    csrf_protect: CsrfProtect = Depends(),
    current_user: CurrentUser = Depends(get_current_user),
    db: DB = Depends(),
):
    """Create transaction with CSRF protection"""
    # CSRF token automatically validated
    # ... implementation

# frontend/src/services/api.ts
// Automatically include CSRF token in all POST/PATCH/DELETE requests
api.interceptors.request.use((config) => {
    if (['post', 'patch', 'delete'].includes(config.method?.toLowerCase())) {
        const token = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');
        if (token) {
            config.headers['X-CSRF-Token'] = token;
        }
    }
    return config;
});

// frontend/index.html
<meta name="csrf-token" content="" />

// frontend/src/main.tsx
// Fetch CSRF token on app init
fetch('/api/auth/csrf-token')
    .then(r => r.json())
    .then(data => {
        document.querySelector('meta[name="csrf-token"]')?.setAttribute('content', data.token);
    });
```

**Estimated Effort:** 2 hours  
**Priority:** MEDIUM  
**Free Cost:** $0

---

---

## PHASE 4: OBSERVABILITY & RESILIENCE

### 4.1 Error Logging with Sentry (FREE Tier)
**Source:** [Sentry](https://sentry.io) - Free tier: 5k events/month

**Why:** Track 1% sample of production errors without paying. Alerts for critical issues.

**Setup Cost:** FREE (5,000 events/month)  
**Alternative:** [Rollbar](https://rollbar.com) (5k events/month free) or [LogSnag](https://logsnag.com) ($20/mo but allows custom events)

**Implementation:**
```python
# backend/app/main.py
import sentry_sdk
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.integrations.sqlalchemy import SqlalchemyIntegration

sentry_sdk.init(
    dsn=settings.SENTRY_DSN,
    integrations=[FastApiIntegration()],
    traces_sample_rate=0.01,  # 1% sampling
    environment=settings.ENVIRONMENT,
    # Mask sensitive headers/data
    before_send=lambda event, hint: mask_sensitive_data(event),
)

def mask_sensitive_data(event):
    # Remove auth headers from error context
    if 'request' in event:
        event['request']['headers'] = {
            k: '***' if k.lower() in ['authorization', 'cookie'] else v
            for k, v in event['request'].get('headers', {}).items()
        }
    return event

# Example: Track API errors
@app.exception_handler(HTTPException)
async def http_exception_handler(request, exc):
    if exc.status_code >= 500:
        # Send to Sentry
        sentry_sdk.capture_exception(exc)
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})
```

```typescript
// frontend/src/main.tsx
import * as Sentry from "@sentry/react";

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  environment: import.meta.env.MODE,
  tracesSampleRate: 0.01,  // 1% sampling
  integrations: [
    new Sentry.Replay({
      maskAllText: true,  // Don't record personal data
      blockAllMedia: true,
    }),
  ],
  replaysSessionSampleRate: 0.001,  // Very low for replay
});

// Wrap app
const SentryApp = Sentry.withProfiler(App);
export default SentryApp;
```

```kotlin
// mobile/build.gradle.kts
dependencies {
    implementation("io.sentry:sentry-android:7.0.0")
}

// mobile/app/src/main/AndroidManifest.xml
<application>
    <meta-data
        android:name="io.sentry.dsn"
        android:value="<YOUR_SENTRY_DSN>" />
    <meta-data
        android:name="io.sentry.environment"
        android:value="production" />
</application>

// mobile/app/src/main/java/com/finlo/app/FinloApplication.kt
class FinloApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        Sentry.init(this) { options ->
            options.tracesSampleRate = 0.01
            options.isAttachScreenshot = false  // Don't capture screenshots
            options.isCaptureAllBreadcrumbs = true
        }
    }
}
```

**Estimated Effort:** 3 hours  
**Priority:** MEDIUM  
**Free Cost:** $0 (5k events/month free)

---

### 4.2 Analytics with PostHog (FREE Tier)
**Source:** [PostHog](https://posthog.com) - Free tier: Unlimited events

**Why:** Track user behavior without PII. Understand where users drop off, common error patterns.

**Setup Cost:** FREE (unlimited events for self-hosted or use cloud free tier)

**Implementation:**
```typescript
// frontend/src/main.tsx
import posthog from 'posthog-js'

posthog.init(
    import.meta.env.VITE_POSTHOG_KEY,
    {
        api_host: import.meta.env.VITE_POSTHOG_HOST,
        person_profiles: 'always',
        mask_all_text: true,  // Don't store personal text
        mask_all_numbers: false,
        autocapture: false,  // Manual event tracking only
    }
)

// Track important events
posthog.capture('transaction_created', { category: 'Food', amount: '$50' })
posthog.capture('budget_exceeded', { category: 'Transport' })
posthog.capture('error_occurred', { error_code: 'NETWORK_ERROR', page: 'Dashboard' })
```

```python
# backend/app/main.py (optional, for backend events)
from posthog import Posthog

posthog = Posthog(api_key=settings.POSTHOG_KEY, host=settings.POSTHOG_HOST)

# Track backend events
posthog.capture(
    distinct_id=current_user.id,
    event='transaction_created',
    properties={'amount': body.amount, 'category': body.category_id}
)
```

**Estimated Effort:** 2 hours  
**Priority:** LOW  
**Free Cost:** $0 (unlimited events)

---

### 4.3 Certificate Pinning & Request Tracing (FREE)

**Mobile - Certificate Pinning:**
```kotlin
@Provides
@Singleton
fun provideOkHttp(): OkHttpClient {
  val certificatePinner = CertificatePinner.Builder()
    // Get your cert hash: `openssl s_client -connect api.finlo.app:443 < /dev/null | openssl x509 -noout -pubkey | openssl asn1parse -strparse 19 -out - | openssl dgst -sha256 -binary | openssl enc -base64`
    .add("api.finlo.app", "sha256/YOUR_CERT_HASH_HERE")
    .build()

  return OkHttpClient.Builder()
    .certificatePinner(certificatePinner)
    .connectTimeout(15, TimeUnit.SECONDS)
    .readTimeout(30, TimeUnit.SECONDS)
    .writeTimeout(30, TimeUnit.SECONDS)
    .build()
}
```

**Mobile - Request Tracing:**
```kotlin
@Provides
@Singleton
fun provideRequestIdInterceptor(): Interceptor = Interceptor { chain ->
  val requestId = UUID.randomUUID().toString()
  val request = chain.request().newBuilder()
    .addHeader("X-Request-ID", requestId)
    .build()
  
  Log.d("API", "Request $requestId: ${request.method} ${request.url}")
  
  try {
    val response = chain.proceed(request)
    Log.d("API", "Response $requestId: ${response.code}")
    response
  } catch (e: IOException) {
    Log.e("API", "Failed $requestId: ${e.message}")
    throw e
  }
}
```

**Estimated Effort:** 3 hours  
**Priority:** MEDIUM  
**Free Cost:** $0

---

### 4.4 Data Export Utility (FREE)

**Purpose:** Allow users to export/delete their data (GDPR compliance)

```python
# backend/app/api/data.py
@router.get("/user/export", response_class=StreamingResponse)
async def export_user_data(
    current_user: CurrentUser = Depends(get_current_user),
    db: DB = Depends(),
):
    """Export all user data as JSON"""
    # Fetch all user data
    txns = await db.get_user_transactions(current_user.id)
    budgets = await db.get_user_budgets(current_user.id)
    bills = await db.get_user_bills(current_user.id)
    
    data = {
        "user": current_user.to_dict(),
        "transactions": [t.to_dict() for t in txns],
        "budgets": [b.to_dict() for b in budgets],
        "bills": [b.to_dict() for b in bills],
        "exported_at": datetime.now(timezone.utc).isoformat(),
    }
    
    # Stream as file
    json_data = json.dumps(data, indent=2, default=str)
    return StreamingResponse(
        iter([json_data]),
        media_type="application/json",
        headers={"Content-Disposition": "attachment; filename=finlo-export.json"},
    )

@router.post("/user/delete")
async def delete_account(
    body: DeleteAccountRequest,  # Require password confirmation
    current_user: CurrentUser = Depends(get_current_user),
    db: DB = Depends(),
):
    """Permanently delete user account and data"""
    if not pwd_context.verify(body.password, current_user.password_hash):
        raise HTTPException(status_code=403, detail="Invalid password")
    
    # Delete cascading data
    await db.delete_user_and_data(current_user.id)
    
    return {"detail": "Account deleted successfully"}
```

**Estimated Effort:** 2 hours  
**Priority:** MEDIUM  
**Free Cost:** $0

---

---

## SUMMARY: Implementation Effort & Cost Breakdown

| Phase | Focus | Effort | Cost | Timeline |
|--|--|--|--|--|
| **Phase 1** | Input validation, error handling, auth fixes | 20-24h | $0 | Week 1 |
| **Phase 2** | Audit logging, encryption, mobile caching | 20-24h | $0 | Weeks 2-3 |
| **Phase 3** | Auth hardening, rate limiting, password | 8-12h | $0 | Month 2, wk 1 |
| **Phase 4** | Sentry, PostHog, cert pinning, data export | 10-16h | $0-5/mo | Month 2, wk 2-4 |
| **TOTAL** | Full hardening | **60-76 hours** | **$0-5/mo** | **8-10 weeks** |

---

## FREE Tools Used

| Tool | Purpose | Cost | Why |
|--|--|--|--|
| Pydantic | Input validation (backend) | $0 | Built-in to FastAPI |
| Zod | Input validation (frontend) | $0 | MIT license |
| FastAPI-CSRF | CSRF protection | $0 | MIT license |
| Slowapi | Rate limiting | $0 | MIT license |
| PostgreSQL pgcrypto | Encryption at rest | $0 | Built-in |
| Room Database | Mobile caching | $0 | Built-in Android |
| WorkManager | Background sync | $0 | Built-in Android |
| Sentry Free | Error monitoring (5k/mo) | $0 | Free tier |
| PostHog Free | Analytics (unlimited) | $0 | Free tier |
| OkHttp | Mobile HTTP + pinning | $0 | Built-in Android |
| FastAPI | Web framework | $0 | MIT license |
| React | Frontend framework | $0 | MIT license |
| Kotlin | Mobile framework | $0 | Apache 2.0 |

---

## Next Steps

1. **Pick a Phase** based on your timeline
2. **Use the code examples** provided in this guide
3. **Test thoroughly** with the recommendations in SECURITY_AUDIT.md
4. **Enable CI/CD checks** (GitHub Actions, which is free) to catch regressions

---

## Questions?
- See `SECURITY_AUDIT.md` for detailed issue explanations
- See `CLAUDE.md` for project architecture
- See this file for free tier implementations
