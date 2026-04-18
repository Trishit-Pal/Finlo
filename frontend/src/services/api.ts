import axios from "axios";
import type { UserProfile } from "../types";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";
export const AUTH_TOKEN_KEY = "finance_jwt";
export const REFRESH_TOKEN_KEY = "finance_refresh";

export const getStoredToken = () => sessionStorage.getItem(AUTH_TOKEN_KEY);

export const getStoredRefresh = () => sessionStorage.getItem(REFRESH_TOKEN_KEY);

export const clearStoredTokens = () => {
  sessionStorage.removeItem(AUTH_TOKEN_KEY);
  sessionStorage.removeItem(REFRESH_TOKEN_KEY);
  // Clean up any token left behind by an older build that used localStorage.
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
};

export const setStoredTokens = (access: string, refresh: string) => {
  sessionStorage.setItem(AUTH_TOKEN_KEY, access);
  sessionStorage.setItem(REFRESH_TOKEN_KEY, refresh);
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
};

// ── Structured error response from backend ──────────────────────────────────
export interface ApiError {
  status: "error";
  code: string;
  message: string;
  details: Record<string, unknown>;
}

export const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  timeout: 30000,
  headers: {
    "Content-Type": "application/json",
  },
});

api.interceptors.request.use((config) => {
  const token = getStoredToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  // Attach request ID for tracing
  config.headers["X-Request-ID"] = crypto.randomUUID();
  return config;
});

// Silent token refresh on 401
let refreshPromise: Promise<string> | null = null;

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Only attempt refresh for 401s that aren't already retries or refresh calls
    if (
      error.response?.status === 401 &&
      !originalRequest._retry &&
      !originalRequest.url?.includes("/auth/refresh") &&
      !originalRequest.url?.includes("/auth/signin") &&
      !originalRequest.url?.includes("/auth/signup")
    ) {
      originalRequest._retry = true;
      const refreshToken = getStoredRefresh();
      if (!refreshToken) {
        clearStoredTokens();
        window.dispatchEvent(new Event("auth:unauthorized"));
        return Promise.reject(error);
      }

      try {
        // Deduplicate concurrent refresh calls
        if (!refreshPromise) {
          refreshPromise = axios
            .post(`${API_URL}/auth/refresh`, { refresh_token: refreshToken })
            .then((res) => {
              const { access_token, refresh_token: newRefresh } = res.data;
              setStoredTokens(access_token, newRefresh);
              return access_token;
            })
            .finally(() => {
              refreshPromise = null;
            });
        }

        const newAccessToken = await refreshPromise;
        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        return api(originalRequest);
      } catch {
        clearStoredTokens();
        window.dispatchEvent(new Event("auth:unauthorized"));
        return Promise.reject(error);
      }
    }

    if (error.response?.status === 401) {
      clearStoredTokens();
      window.dispatchEvent(new Event("auth:unauthorized"));
    }

    // Extract structured error message from backend response
    const data = error.response?.data as ApiError | undefined;
    if (data?.message) {
      error.userMessage = data.message;
      error.errorCode = data.code;
    } else if (error.code === "ECONNABORTED") {
      error.userMessage = "Request timed out. Please check your connection.";
      error.errorCode = "TIMEOUT";
    } else if (!error.response) {
      error.userMessage =
        "Unable to connect to server. Please check your connection.";
      error.errorCode = "NETWORK_ERROR";
    } else {
      error.userMessage = "Something went wrong. Please try again.";
      error.errorCode = "UNKNOWN";
    }

    return Promise.reject(error);
  },
);

export const authService = {
  resetPassword: (email: string) =>
    api.post("/auth/reset-password", { email }).then((res) => res.data),

  requestOtp: (mobile_number: string) =>
    api
      .post("/auth/forgot-password/request-otp", { mobile_number })
      .then((res) => res.data),

  resetWithOtp: (data: {
    mobile_number: string;
    otp: string;
    new_password: string;
  }) =>
    api
      .post("/auth/forgot-password/reset-with-otp", data)
      .then((res) => res.data),

  updateProfile: (data: Partial<UserProfile>) =>
    api.patch("/auth/me", { profile: data }).then((res) => res.data),
};
