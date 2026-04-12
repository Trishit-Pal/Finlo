package com.finlo.app.util

/**
 * Input validation utilities matching backend Pydantic constraints.
 * All validators return null on success or an error message string on failure.
 */
object Validations {

    // ── Shared constants (match backend) ────────────────────────────────────

    val VALID_PAYMENT_MODES = setOf("cash", "upi", "card", "net_banking")
    val VALID_FREQUENCIES = setOf("once", "weekly", "monthly", "quarterly", "yearly")
    val VALID_DEBT_TYPES = setOf("personal_loan", "credit_card", "owed_to", "owed_by")
    private val ISO_DATE_REGEX = Regex("""^\d{4}-\d{2}-\d{2}$""")

    // ── Field validators ────────────────────────────────────────────────────

    fun requireNonBlank(value: String, fieldName: String): String? =
        if (value.isBlank()) "$fieldName is required" else null

    fun maxLength(value: String, max: Int, fieldName: String): String? =
        if (value.length > max) "$fieldName must be at most $max characters" else null

    fun positiveAmount(value: Double, fieldName: String = "Amount"): String? =
        if (value <= 0) "$fieldName must be greater than zero" else null

    fun nonNegativeAmount(value: Double, fieldName: String = "Amount"): String? =
        if (value < 0) "$fieldName cannot be negative" else null

    fun maxAmount(value: Double, max: Double = 100_000_000.0, fieldName: String = "Amount"): String? =
        if (value > max) "$fieldName exceeds maximum allowed value" else null

    fun isoDate(value: String, fieldName: String = "Date"): String? =
        if (!ISO_DATE_REGEX.matches(value)) "$fieldName must be in YYYY-MM-DD format" else null

    fun oneOf(value: String, allowed: Set<String>, fieldName: String): String? =
        if (value !in allowed) "$fieldName must be one of: ${allowed.joinToString(", ")}" else null

    // ── Password strength (matches backend policy) ──────────────────────────

    fun passwordStrength(password: String): String? {
        if (password.length < 10) return "Password must be at least 10 characters"
        if (password.length > 128) return "Password must be at most 128 characters"
        if (!password.any { it.isLetter() }) return "Password must contain at least one letter"
        if (password.count { it.isDigit() } < 2) return "Password must contain at least 2 digits"
        return null
    }

    // ── Composite validators for create forms ───────────────────────────────

    fun validateTransaction(merchant: String, amount: Double, date: String): String? {
        return requireNonBlank(merchant, "Merchant")
            ?: maxLength(merchant, 200, "Merchant")
            ?: positiveAmount(amount)
            ?: maxAmount(amount)
            ?: isoDate(date)
    }

    fun validateBill(name: String, amount: Double, dueDate: String, frequency: String): String? {
        return requireNonBlank(name, "Name")
            ?: maxLength(name, 200, "Name")
            ?: nonNegativeAmount(amount)
            ?: maxAmount(amount)
            ?: isoDate(dueDate, "Due date")
            ?: oneOf(frequency, VALID_FREQUENCIES, "Frequency")
    }

    fun validateDebt(name: String, type: String, totalAmount: Double, remainingBalance: Double): String? {
        return requireNonBlank(name, "Name")
            ?: maxLength(name, 200, "Name")
            ?: oneOf(type, VALID_DEBT_TYPES, "Type")
            ?: nonNegativeAmount(totalAmount, "Total amount")
            ?: nonNegativeAmount(remainingBalance, "Remaining balance")
    }

    fun validateSavingsGoal(name: String, targetAmount: Double): String? {
        return requireNonBlank(name, "Name")
            ?: maxLength(name, 200, "Name")
            ?: positiveAmount(targetAmount, "Target amount")
    }

    fun validateContribution(amount: Double): String? {
        return positiveAmount(amount, "Contribution")
            ?: maxAmount(amount)
    }
}
