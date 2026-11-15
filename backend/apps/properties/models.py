from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import models

from apps.core.models import TenantScopedModel


class PropertyType(models.TextChoices):
    RESIDENTIAL = "RESIDENTIAL", "Residential"
    COMMERCIAL = "COMMERCIAL", "Commercial"
    MIXED = "MIXED", "Mixed Use"


class PropertyStatus(models.TextChoices):
    ACTIVE = "ACTIVE", "Active"
    ARCHIVED = "ARCHIVED", "Archived"


class Property(TenantScopedModel):
    """Real estate property owned or managed by an organization."""

    name = models.CharField(max_length=255)
    property_type = models.CharField(
        max_length=20,
        choices=PropertyType.choices,
        default=PropertyType.RESIDENTIAL,
    )
    address = models.CharField(max_length=255, blank=True)
    county = models.CharField(max_length=100, blank=True)
    town = models.CharField(max_length=100, blank=True)
    status = models.CharField(
        max_length=20,
        choices=PropertyStatus.choices,
        default=PropertyStatus.ACTIVE,
    )

    class Meta:
        ordering = ["name"]
        verbose_name_plural = "properties"

    def __str__(self) -> str:
        return self.name


class Building(TenantScopedModel):
    """Optional block or building within a property."""

    property = models.ForeignKey(
        Property,
        on_delete=models.PROTECT,
        related_name="buildings",
    )
    name = models.CharField(max_length=120)

    class Meta:
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(
                fields=["organization", "property", "name"],
                name="uniq_building_name_per_property_org",
            )
        ]

    def clean(self):
        if self.property_id and self.organization_id:
            if self.property.organization_id != self.organization_id:
                raise ValidationError("Building property must belong to the same organization.")

    def __str__(self) -> str:
        return f"{self.property.name} - {self.name}"


class UnitType(models.TextChoices):
    BEDSITTER = "BEDSITTER", "Bedsitter"
    STUDIO = "STUDIO", "Studio"
    ONE_BR = "1BR", "1 Bedroom"
    TWO_BR = "2BR", "2 Bedroom"
    THREE_BR = "3BR", "3 Bedroom"
    SHOP = "SHOP", "Shop"
    OFFICE = "OFFICE", "Office"
    OTHER = "OTHER", "Other"


class UnitStatus(models.TextChoices):
    VACANT = "VACANT", "Vacant"
    OCCUPIED = "OCCUPIED", "Occupied"
    MAINTENANCE = "MAINTENANCE", "Maintenance"
    ARCHIVED = "ARCHIVED", "Archived"


class Unit(TenantScopedModel):
    """Rentable unit inside a property (and optionally a building)."""

    property = models.ForeignKey(
        Property,
        on_delete=models.PROTECT,
        related_name="units",
    )
    building = models.ForeignKey(
        Building,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="units",
    )
    unit_code = models.CharField(max_length=40)
    unit_type = models.CharField(
        max_length=20,
        choices=UnitType.choices,
        default=UnitType.ONE_BR,
    )
    advertised_rent = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        default=Decimal("0.00"),
    )
    status = models.CharField(
        max_length=20,
        choices=UnitStatus.choices,
        default=UnitStatus.VACANT,
    )

    class Meta:
        ordering = ["unit_code"]
        constraints = [
            models.UniqueConstraint(
                fields=["organization", "property", "unit_code"],
                name="uniq_unit_code_per_property_org",
            )
        ]

    def clean(self):
        if self.property_id and self.organization_id:
            if self.property.organization_id != self.organization_id:
                raise ValidationError("Unit property must belong to the same organization.")
        if self.building_id:
            if self.building.organization_id != self.organization_id:
                raise ValidationError("Unit building must belong to the same organization.")
            if self.building.property_id != self.property_id:
                raise ValidationError("Unit building must belong to the selected property.")

    def __str__(self) -> str:
        return f"{self.property.name} ({self.unit_code})"


class Owner(TenantScopedModel):
    """Landlord / beneficial owner profile managed by an organization."""

    full_name = models.CharField(max_length=255)
    phone = models.CharField(max_length=32, blank=True)
    email = models.EmailField(blank=True)

    class Meta:
        ordering = ["full_name"]

    def __str__(self) -> str:
        return self.full_name


class PropertyOwner(TenantScopedModel):
    """Ownership share link between a Property and an Owner."""

    property = models.ForeignKey(
        Property,
        on_delete=models.PROTECT,
        related_name="property_owners",
    )
    owner = models.ForeignKey(
        Owner,
        on_delete=models.PROTECT,
        related_name="property_links",
    )
    ownership_share = models.DecimalField(max_digits=5, decimal_places=2)
    valid_from = models.DateField()
    valid_to = models.DateField(null=True, blank=True)

    class Meta:
        ordering = ["-valid_from", "owner__full_name"]

    def clean(self):
        if self.property_id and self.organization_id:
            if self.property.organization_id != self.organization_id:
                raise ValidationError("Property must belong to the same organization.")
        if self.owner_id and self.organization_id:
            if self.owner.organization_id != self.organization_id:
                raise ValidationError("Owner must belong to the same organization.")
        if self.ownership_share is not None and (
            self.ownership_share <= Decimal("0.00")
            or self.ownership_share > Decimal("100.00")
        ):
            raise ValidationError("Ownership share must be between 0.01 and 100.00.")

    def __str__(self) -> str:
        return f"{self.owner.full_name} ({self.ownership_share}%)"
