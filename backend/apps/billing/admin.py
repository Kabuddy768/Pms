from django.contrib import admin

from .models import Invoice, InvoiceAdjustment, InvoiceLine, OrganizationSequence


@admin.register(OrganizationSequence)
class OrganizationSequenceAdmin(admin.ModelAdmin):
    list_display = ("organization", "sequence_type", "year", "last_number")


@admin.register(Invoice)
class InvoiceAdmin(admin.ModelAdmin):
    list_display = (
        "invoice_number",
        "lease",
        "billing_period",
        "total_amount",
        "status",
        "due_date",
    )
    list_filter = ("status", "billing_period")
    search_fields = ("invoice_number",)


@admin.register(InvoiceLine)
class InvoiceLineAdmin(admin.ModelAdmin):
    list_display = ("invoice", "charge_type", "description", "line_total")


@admin.register(InvoiceAdjustment)
class InvoiceAdjustmentAdmin(admin.ModelAdmin):
    list_display = ("invoice", "adjustment_type", "amount", "reason", "created_at")
