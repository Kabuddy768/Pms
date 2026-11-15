from django.contrib import admin

from .models import MaintenanceRequest


@admin.register(MaintenanceRequest)
class MaintenanceRequestAdmin(admin.ModelAdmin):
    list_display = ("title", "property", "unit", "priority", "status", "created_at")
    list_filter = ("priority", "status")
    search_fields = ("title", "property__name", "unit__unit_code")
