package com.finlo.app.data.remote.api

import com.finlo.app.data.remote.dto.*
import retrofit2.Response
import retrofit2.http.*

interface FinloApi {

    // ── Auth ────────────────────────────────────────────────────────────────
    @POST("auth/signup")
    suspend fun signup(@Body body: SignupRequest): AuthResponse

    @POST("auth/signin")
    suspend fun signin(@Body body: SigninRequest): AuthResponse

    @POST("auth/oauth/callback")
    suspend fun oauthCallback(@Body body: OAuthCallbackRequest): AuthResponse

    @POST("auth/refresh")
    suspend fun refreshToken(@Body body: RefreshRequest): AuthResponse

    @GET("auth/me")
    suspend fun getMe(): UserDto

    @PATCH("auth/me")
    suspend fun updateMe(@Body body: Map<String, @JvmSuppressWildcards Any?>): UserDto

    // ── Transactions ────────────────────────────────────────────────────────
    @GET("transactions")
    suspend fun getTransactions(
        @Query("limit") limit: Int = 50,
        @Query("offset") offset: Int = 0,
        @Query("category") category: String? = null,
        @Query("date_from") dateFrom: String? = null,
        @Query("date_to") dateTo: String? = null,
    ): TransactionListResponse

    @POST("transactions")
    suspend fun createTransaction(@Body body: TransactionCreateRequest): TransactionDto

    @PATCH("transactions/{id}")
    suspend fun updateTransaction(@Path("id") id: String, @Body body: Map<String, @JvmSuppressWildcards Any?>): TransactionDto

    @DELETE("transactions/{id}")
    suspend fun deleteTransaction(@Path("id") id: String): Response<Unit>

    // ── Dashboard ───────────────────────────────────────────────────────────
    @GET("coach/dashboard")
    suspend fun getDashboard(@Query("timeframe") timeframe: String = "month"): DashboardResponse

    // ── Bills ───────────────────────────────────────────────────────────────
    @GET("bills")
    suspend fun getBills(): List<BillDto>

    @POST("bills")
    suspend fun createBill(@Body body: BillCreateRequest): BillDto

    @POST("bills/{id}/mark-paid")
    suspend fun markBillPaid(@Path("id") id: String): BillDto

    @DELETE("bills/{id}")
    suspend fun deleteBill(@Path("id") id: String): Response<Unit>

    @GET("bills/upcoming/next7days")
    suspend fun getUpcomingBills(): List<BillDto>

    // ── Budgets ─────────────────────────────────────────────────────────────
    @GET("budgets")
    suspend fun getBudgets(): BudgetListResponse

    @POST("budgets")
    suspend fun createBudget(@Body body: BudgetCreateRequest): BudgetDto

    @PATCH("budgets/{id}")
    suspend fun updateBudget(@Path("id") id: String, @Body body: Map<String, @JvmSuppressWildcards Any?>): BudgetDto

    @DELETE("budgets/{id}")
    suspend fun deleteBudget(@Path("id") id: String): Response<Unit>

    // ── Debts ───────────────────────────────────────────────────────────────
    @GET("debts")
    suspend fun getDebts(): List<DebtDto>

    @GET("debts/summary")
    suspend fun getDebtSummary(): DebtSummaryDto

    @POST("debts")
    suspend fun createDebt(@Body body: DebtCreateRequest): DebtDto

    @POST("debts/{id}/pay")
    suspend fun payDebt(@Path("id") id: String, @Body body: Map<String, Double>): DebtDto

    @POST("debts/{id}/settle")
    suspend fun settleDebt(@Path("id") id: String): DebtDto

    @DELETE("debts/{id}")
    suspend fun deleteDebt(@Path("id") id: String): Response<Unit>

    // ── Savings ─────────────────────────────────────────────────────────────
    @GET("savings")
    suspend fun getSavingsGoals(): List<SavingsGoalDto>

    @POST("savings")
    suspend fun createSavingsGoal(@Body body: SavingsGoalCreateRequest): SavingsGoalDto

    @POST("savings/{id}/contribute")
    suspend fun contributeSavings(@Path("id") id: String, @Body body: Map<String, Double>): SavingsGoalDto

    @DELETE("savings/{id}")
    suspend fun deleteSavingsGoal(@Path("id") id: String): Response<Unit>

    // ── Categories ──────────────────────────────────────────────────────────
    @GET("categories")
    suspend fun getCategories(): List<CategoryDto>

    @POST("categories/init")
    suspend fun initCategories(): List<CategoryDto>

    // ── Coach ───────────────────────────────────────────────────────────────
    @POST("coach/suggestions/{id}/respond")
    suspend fun respondSuggestion(@Path("id") id: String, @Body body: Map<String, String>): Response<Unit>
}
