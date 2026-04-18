"""Start uvicorn with local-auth env (no Supabase) for smoke testing."""
import os, sys

os.environ['SUPABASE_URL'] = ''
os.environ['SUPABASE_ANON_KEY'] = ''
os.environ['SUPABASE_SERVICE_ROLE_KEY'] = ''
os.environ['SUPABASE_JWT_SECRET'] = ''
os.environ['DATABASE_URL'] = 'sqlite+aiosqlite:///./smoke_test.db'
os.environ['JWT_SECRET'] = 'smoke-test-secret-key-32chars!!'
os.environ['ENVIRONMENT'] = 'test'
os.environ['LLM_PROVIDER_KEY'] = ''
os.environ['EMBEDDING_PROVIDER_KEY'] = ''
os.environ['STORAGE_ENCRYPTION_KEY'] = 'a' * 64
os.environ['STORAGE_ENDPOINT'] = 'http://localhost:9000'
os.environ['STORAGE_ACCESS_KEY'] = 'minioadmin'
os.environ['STORAGE_SECRET_KEY'] = 'minioadmin'
os.environ['STORAGE_BUCKET'] = 'test-bucket'
os.environ['REDIS_URL'] = ''

import uvicorn
uvicorn.run("app.main:app", host="127.0.0.1", port=8765, log_level="warning")
