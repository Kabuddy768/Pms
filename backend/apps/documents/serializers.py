from rest_framework import serializers

from apps.expenses.models import Expense
from apps.leasing.models import Lease
from apps.maintenance.models import MaintenanceRequest

from .models import Attachment, AttachmentEntityType


class AttachmentSerializer(serializers.ModelSerializer):
    uploaded_by_email = serializers.EmailField(
        source="uploaded_by.email", read_only=True, default=None
    )

    class Meta:
        model = Attachment
        fields = [
            "id",
            "entity_type",
            "entity_id",
            "title",
            "file_url",
            "content_type",
            "uploaded_by_email",
            "created_at",
        ]
        read_only_fields = ["id", "uploaded_by_email", "created_at"]

    def validate_file_url(self, value: str) -> str:
        cleaned = value.strip()
        lower = cleaned.lower()
        if not (lower.startswith("https://") or lower.startswith("http://")):
            raise serializers.ValidationError(
                "Only external http:// or https:// object storage URLs are permitted."
            )
        return cleaned

    def validate(self, attrs):
        org = self.context["organization"]
        entity_type = attrs["entity_type"]
        entity_id = attrs["entity_id"]

        exists = False
        if entity_type == AttachmentEntityType.MAINTENANCE:
            exists = MaintenanceRequest.objects.filter(
                organization=org, id=entity_id
            ).exists()
        elif entity_type in (AttachmentEntityType.LEASE, AttachmentEntityType.INSPECTION):
            exists = Lease.objects.filter(organization=org, id=entity_id).exists()
        elif entity_type == AttachmentEntityType.EXPENSE:
            exists = Expense.objects.filter(organization=org, id=entity_id).exists()

        if not exists:
            raise serializers.ValidationError(
                {"entity_id": "Referenced record does not belong to your organization."}
            )
        return attrs
