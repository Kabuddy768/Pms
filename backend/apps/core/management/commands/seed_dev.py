from decimal import Decimal

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.organizations.models import (
    MembershipStatus,
    Organization,
    OrganizationMembership,
    OrganizationRole,
)
from apps.properties.models import Property, Unit, UnitType

User = get_user_model()


class Command(BaseCommand):
    help = "Create a local development admin user (admin@pms.local / password123) and sample org."

    def add_arguments(self, parser):
        parser.add_argument(
            "--force",
            action="store_true",
            help="Allow running even when DEBUG=False.",
        )

    @transaction.atomic
    def handle(self, *args, **options):
        if not settings.DEBUG and not options["force"]:
            raise CommandError("Refusing to seed dev data when DEBUG=False (use --force).")

        email = "admin@pms.local"
        password = "password123"

        user, created = User.objects.get_or_create(
            email=email,
            defaults={
                "full_name": "Dev Admin",
                "is_staff": True,
                "is_superuser": True,
                "is_active": True,
            },
        )
        if created:
            user.set_password(password)
            user.save()
            self.stdout.write(self.style.SUCCESS(f"Created dev superuser: {email}"))
        else:
            self.stdout.write(f"Dev superuser already exists: {email}")

        org, org_created = Organization.objects.get_or_create(
            slug="kilimani-estates",
            defaults={"name": "Kilimani Estates"},
        )
        OrganizationMembership.objects.get_or_create(
            organization=org,
            user=user,
            defaults={
                "role": OrganizationRole.OWNER,
                "status": MembershipStatus.ACTIVE,
            },
        )

        if org_created:
            prop = Property.objects.create(
                organization=org,
                name="Kilimani Heights",
                address="Argwings Kodhek Rd",
                county="Nairobi",
                town="Kilimani",
            )
            Unit.objects.create(
                organization=org,
                property=prop,
                unit_code="A1",
                unit_type=UnitType.TWO_BR,
                advertised_rent=Decimal("45000.00"),
            )
            Unit.objects.create(
                organization=org,
                property=prop,
                unit_code="A2",
                unit_type=UnitType.ONE_BR,
                advertised_rent=Decimal("32000.00"),
            )
            self.stdout.write(self.style.SUCCESS(f"Created sample org '{org.name}' with 2 units."))
