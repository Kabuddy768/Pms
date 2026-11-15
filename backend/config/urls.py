"""Root URL configuration for the PMS API."""

from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path("api/docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="swagger-ui"),
    path("api/v1/", include("apps.core.urls")),
    path("api/v1/auth/", include("apps.accounts.urls")),
    path("api/v1/organizations/", include("apps.organizations.urls")),
    path("api/v1/audit-events/", include("apps.audit.urls")),
    path("api/v1/", include("apps.properties.urls")),
    path("api/v1/", include("apps.leasing.urls")),
    path("api/v1/", include("apps.billing.urls")),
    path("api/v1/", include("apps.payments.urls")),
    path("api/v1/", include("apps.expenses.urls")),
    path("api/v1/", include("apps.maintenance.urls")),
    path("api/v1/", include("apps.reporting.urls")),
]
