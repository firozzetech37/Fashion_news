# Authentication & Authorization Strategy

Authentication in TrendScope connects our Next.js frontend with our FastAPI backend seamlessly and securely.

## 1. Authentication Provider: Supabase Auth

We will use **Supabase Auth** as the primary identity provider. It offers:
- Email/Password authentication.
- Social Logins (Google, Apple, etc.) - crucial for consumer apps.
- JWT (JSON Web Token) generation out of the box.
- Seamless integration with the PostgreSQL database.

## 2. Next.js Frontend Authentication

- **Implementation:** We will use `@supabase/ssr` (or Supabase Auth Helpers) to manage auth state in Next.js.
- **Client Components:** Can react to user state (e.g., showing User Profile vs Login Button).
- **Server Components:** Can verify cookies securely to render protected routes (like `/admin` or user preferences).
- **API Requests:** The frontend will extract the user's `access_token` (JWT) from the Supabase session and attach it as a `Bearer` token in the `Authorization` header when making requests to the FastAPI backend.

## 3. FastAPI Backend Authorization

The backend does not manage passwords. It simply verifies the JWT issued by Supabase.

1. **JWT Validation:** FastAPI will use a dependency (e.g., `fastapi-jwt-auth` or a custom middleware using `PyJWT`) to decode and verify the incoming JWT using the Supabase project's JWT Secret.
2. **User Identity:** The decoded token contains the `sub` (User ID). FastAPI uses this ID to map requests to the correct user in the database.
3. **Role-Based Access Control (RBAC):**
   - **Consumers:** Standard users accessing public/personalized trends.
   - **Admins:** Users with a specific role (stored in a `users` table or Supabase custom claims) who can access endpoints like `POST /api/sources` or view pipeline health.
   - **B2B Partners:** (Future) Users with specific subscription tiers granting them access to advanced forecasting endpoints.

## 4. Example Backend Flow
```python
from fastapi import Depends, HTTPException, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import jwt

security = HTTPBearer()

def get_current_user(credentials: HTTPAuthorizationCredentials = Security(security)):
    token = credentials.credentials
    try:
        # Verify token using Supabase JWT Secret
        payload = jwt.decode(token, SUPABASE_JWT_SECRET, algorithms=["HS256"], audience="authenticated")
        user_id = payload.get("sub")
        return user_id
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

@app.get("/api/admin/pipeline-health")
def get_pipeline_health(user_id: str = Depends(get_current_user)):
    # Verify user_id has admin privileges in DB
    check_admin_role(user_id)
    return {"status": "healthy"}
```
