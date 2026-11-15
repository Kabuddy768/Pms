from django.contrib import admin

from .models import AuditEvent


@admin.register(AuditEvent)
class AuditEventAdmin(admin.ModelAdmin):
    list_display = ("organization", "action", "entity_type", "actor_user", "occurred_at")
    list_filter = ("action", "entity_type")
    readonly_fields = (
        "id",
        "organization",
        "actor_user",
        "action",
        "entity_type",
        "entity_id",
        "metadata",
        "occurred_at",
    )
