from django.contrib import admin

from .models import Organization, OrganizationMembership


@admin.register(Organization)
class OrganizationAdmin(admin.ModelAdmin):
    list_display = ("name", "slug", "default_currency", "plan_tier", "created_at")
    search_fields = ("name", "slug")


@admin.register(OrganizationMembership)
class OrganizationMembershipAdmin(admin.ModelAdmin):
    list_display = ("organization", "user", "role", "status", "joined_at")
    list_filter = ("role", "status")
    search_fields = ("organization__name", "user__email")
