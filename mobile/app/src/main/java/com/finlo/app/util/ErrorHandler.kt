package com.finlo.app.util

import kotlinx.coroutines.CancellationException
import java.io.IOException

/**
 * Structured error types matching the backend error shape:
 * {"status": "error", "code": "...", "message": "...", "details": {...}}
 */
sealed class AppError(val userMessage: String, val code: String) {
    class Network : AppError("Check your connection and try again.", "NETWORK_ERROR")
    class Timeout : AppError("Request timed out. Please try again.", "TIMEOUT")
    class Unauthorized : AppError("Please sign in again.", "UNAUTHORIZED")
    class Forbidden : AppError("You don't have permission for this action.", "FORBIDDEN")
    class NotFound(resource: String) : AppError("$resource not found.", "NOT_FOUND")
    class Conflict(detail: String) : AppError(detail, "CONFLICT")
    class Validation(detail: String) : AppError(detail, "VALIDATION_ERROR")
    class RateLimited : AppError("Too many requests. Please wait a moment.", "RATE_LIMITED")
    class Server : AppError("Something went wrong. Please try again later.", "SERVER_ERROR")
    class Unknown(detail: String) : AppError(detail, "UNKNOWN")
}

/**
 * Maps any exception to a user-friendly [AppError].
 * Re-throws [CancellationException] to respect coroutine cancellation.
 */
fun handleApiError(exception: Throwable): AppError {
    return when (exception) {
        is CancellationException -> throw exception
        is java.net.SocketTimeoutException -> AppError.Timeout()
        is IOException -> AppError.Network()
        is retrofit2.HttpException -> {
            val body = try {
                exception.response()?.errorBody()?.string()
            } catch (_: Exception) { null }

            // Try to extract structured message from backend JSON
            val userMessage = body?.let { extractJsonField(it, "message") }

            when (exception.code()) {
                401 -> AppError.Unauthorized()
                403 -> AppError.Forbidden()
                404 -> AppError.NotFound("Resource")
                409 -> AppError.Conflict(userMessage ?: "A conflict occurred.")
                422 -> AppError.Validation(userMessage ?: "Invalid data provided.")
                429 -> AppError.RateLimited()
                in 500..599 -> AppError.Server()
                else -> AppError.Unknown(userMessage ?: "Request failed (${exception.code()})")
            }
        }
        else -> AppError.Unknown(exception.message ?: "An unexpected error occurred.")
    }
}

/**
 * Simple JSON field extraction without adding a dependency.
 * Looks for "field":"value" pattern in a JSON string.
 */
private fun extractJsonField(json: String, field: String): String? {
    val pattern = """"$field"\s*:\s*"([^"]+)"""".toRegex()
    return pattern.find(json)?.groupValues?.getOrNull(1)
}
