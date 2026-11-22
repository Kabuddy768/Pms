import uuid

from django.conf import settings
from django.db import models
from django.utils.text import slugify


class Organization(models.Model):
    """Tenant root entity representing a landlord or property management agency."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    slug = models.SlugField(max_length=120, unique=True)
    default_currency = models.CharField(max_length=3, default="KES")
    timezone = models.CharField(max_length=64, default="Africa/Nairobi")
    plan_tier = models.CharField(max_length=32, default="STARTER")
    unit_limit = models.PositiveIntegerField(default=50)
    kra_pin = models.CharField(max_length=20, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]

    def save(self, *args, **kwargs):
        if not self.slug:
            base = slugify(self.name) or "org"
            self.slug = f"{base}-{str(self.id)[:8]}"
        super().save(*args, **kwargs)

    def __str__(self) -> str:
        return self.name


class OrganizationRole(models.TextChoices):
    OWNER = "OWNER", "Owner"
    MANAGER = "MANAGER", "Manager"
    ACCOUNTANT = "ACCOUNTANT", "Accountant"
    CARETAKER = "CARETAKER", "Caretaker"


class MembershipStatus(models.TextChoices):
    ACTIVE = "ACTIVE", "Active"
    INVITED = "INVITED", "Invited"
    SUSPENDED = "SUSPENDED", "Suspended"


class OrganizationMembership(models.Model):
    """Links a global User to an Organization with a scoped role."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name="memberships",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="memberships",
    )
    role = models.CharField(
        max_length=20,
        choices=OrganizationRole.choices,
        default=OrganizationRole.MANAGER,
    )
    status = models.CharField(
        max_length=20,
        choices=MembershipStatus.choices,
        default=MembershipStatus.ACTIVE,
    )
    joined_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["organization", "user"],
                name="uniq_membership_per_org_user",
            )
        ]
        ordering = ["-joined_at"]

    def __str__(self) -> str:
        return f"{self.user.email} @ {self.organization.slug} ({self.role})"
