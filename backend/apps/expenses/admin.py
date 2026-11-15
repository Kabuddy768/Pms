from django.contrib import admin

from .models import Expense, ExpenseCategory


@admin.register(ExpenseCategory)
class ExpenseCategoryAdmin(admin.ModelAdmin):
    list_display = ("name", "organization")


@admin.register(Expense)
class ExpenseAdmin(admin.ModelAdmin):
    list_display = ("description", "property", "category", "amount", "expense_date", "status")
    list_filter = ("status", "category")
