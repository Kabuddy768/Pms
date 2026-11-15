from django.db import connection
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView


class HealthCheckView(APIView):
    """Unauthenticated liveness and database readiness probe for load balancers and CI."""

    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1")
                cursor.fetchone()
            db_ok = True
        except Exception:
            db_ok = False

        if not db_ok:
            return Response(
                {"status": "degraded", "service": "pms-backend", "database": "unavailable"},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        return Response({"status": "ok", "service": "pms-backend", "database": "ok"})
