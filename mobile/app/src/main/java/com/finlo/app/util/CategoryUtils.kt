package com.finlo.app.util

import androidx.compose.ui.graphics.Color
import com.finlo.app.ui.theme.*

data class CategoryInfo(val name: String, val icon: String, val color: Color)

object CategoryUtils {
    val all = listOf(
        CategoryInfo("Food & Dining", "\uD83C\uDF54", CategoryFood),
        CategoryInfo("Transport", "\uD83D\uDE97", CategoryTransport),
        CategoryInfo("Groceries", "\uD83D\uDED2", CategoryGroceries),
        CategoryInfo("Shopping", "\uD83D\uDECD\uFE0F", CategoryShopping),
        CategoryInfo("Health", "\uD83C\uDFE5", CategoryHealth),
        CategoryInfo("Utilities", "\uD83D\uDCA1", CategoryUtilities),
        CategoryInfo("Entertainment", "\uD83C\uDFAE", CategoryEntertainment),
        CategoryInfo("Education", "\uD83D\uDCDA", CategoryEducation),
        CategoryInfo("Travel", "✈\uFE0F", CategoryTravel),
        CategoryInfo("EMI/Loan", "\uD83C\uDFE6", CategoryEMI),
        CategoryInfo("Rent", "\uD83C\uDFE0", CategoryRent),
        CategoryInfo("Savings", "\uD83D\uDC37", CategorySavings),
        CategoryInfo("Miscellaneous", "\uD83D\uDCCC", CategoryMisc),
        CategoryInfo("Salary", "\uD83D\uDCB0", CategorySavings),
        CategoryInfo("Freelance", "\uD83D\uDCBB", CategoryTravel),
    )

    private val map = all.associateBy { it.name }

    fun get(name: String?): CategoryInfo = map[name] ?: CategoryInfo(name ?: "Uncategorized", "\uD83D\uDCCC", CategoryMisc)
}
