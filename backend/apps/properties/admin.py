from django.contrib import admin

from .models import Building, Owner, Property, PropertyOwner, Unit


@admin.register(Property)
class PropertyAdmin(admin.ModelAdmin):
    list_display = ("name", "organization", "property_type", "county", "town", "status")
    list_filter = ("property_type", "status")
    search_fields = ("name", "county", "town")


@admin.register(Building)
class BuildingAdmin(admin.ModelAdmin):
    list_display = ("name", "property", "organization")


@admin.register(Unit)
class UnitAdmin(admin.ModelAdmin):
    list_display = ("unit_code", "property", "building", "unit_type", "advertised_rent", "status")
    list_filter = ("unit_type", "status")
    search_fields = ("unit_code", "property__name")


@admin.register(Owner)
class OwnerAdmin(admin.ModelAdmin):
    list_display = ("full_name", "phone", "email", "organization")
    search_fields = ("full_name", "phone", "email")


@admin.register(PropertyOwner)
class PropertyOwnerAdmin(admin.ModelAdmin):
    list_display = ("property", "owner", "ownership_share", "valid_from", "valid_to")
