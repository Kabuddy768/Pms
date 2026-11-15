from rest_framework import serializers

from .models import AuditEvent


class AuditEventSerializer(serializers.ModelSerializer):
    actor_email = serializers.EmailField(source="actor_user.email", read_only=True, default=None)

    class Meta:
        model = AuditEvent
        fields = [
            "id",
            "actor_user",
            "actor_email",
            "action",
            "entity_type",
            "entity_id",
            "metadata",
            "occurred_at",
        ]
