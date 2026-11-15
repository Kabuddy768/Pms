from django.contrib import admin

from .models import (
    DepositAccount,
    DepositTransaction,
    Lease,
    LeaseEvent,
    LeaseOccupant,
    Tenant,
)


@admin.register(Tenant)
class TenantAdmin(admin.ModelAdmin):
    list_display = ("full_name", "phone", "email", "status", "organization")
    search_fields = ("full_name", "phone", "email")


@admin.register(Lease)
class LeaseAdmin(admin.ModelAdmin):
    list_display = ("unit", "start_date", "end_date", "rent_amount", "status", "organization")
    list_filter = ("status", "billing_frequency")


@admin.register(LeaseOccupant)
class LeaseOccupantAdmin(admin.ModelAdmin):
    list_display = ("lease", "tenant", "occupant_role")


@admin.register(LeaseEvent)
class LeaseEventAdmin(admin.ModelAdmin):
    list_display = ("lease", "event_type", "actor_user", "occurred_at")


@admin.register(DepositAccount)
class DepositAccountAdmin(admin.ModelAdmin):
    list_display = ("lease", "required_amount", "status")


@admin.register(DepositTransaction)
class DepositTransactionAdmin(admin.ModelAdmin):
    list_display = ("deposit_account", "transaction_type", "amount", "reference", "occurred_at")
