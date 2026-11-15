from django.contrib import admin

from .models import Payment, PaymentAllocation, PaymentReversal, ProviderTransaction


@admin.register(Payment)
class PaymentAdmin(admin.ModelAdmin):
    list_display = (
        "payment_reference",
        "receipt_number",
        "method",
        "amount",
        "status",
        "lease",
        "received_at",
    )
    list_filter = ("method", "status")
    search_fields = ("payment_reference", "receipt_number", "raw_account_ref", "payer_phone")


@admin.register(PaymentAllocation)
class PaymentAllocationAdmin(admin.ModelAdmin):
    list_display = ("payment", "invoice", "amount", "status", "allocated_at")


@admin.register(PaymentReversal)
class PaymentReversalAdmin(admin.ModelAdmin):
    list_display = ("payment", "amount", "reason", "reversed_at")


@admin.register(ProviderTransaction)
class ProviderTransactionAdmin(admin.ModelAdmin):
    list_display = ("provider", "provider_reference", "processing_status", "received_at")
