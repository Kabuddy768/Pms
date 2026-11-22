from django.urls import path

from .views import DashboardSummaryView, KraMriSummaryView, OwnerStatementView

urlpatterns = [
    path("reports/dashboard/", DashboardSummaryView.as_view(), name="reports-dashboard"),
    path(
        "reports/owner-statements/",
        OwnerStatementView.as_view(),
        name="reports-owner-statements",
    ),
    path(
        "reports/kra-mri-summary/",
        KraMriSummaryView.as_view(),
        name="reports-kra-mri-summary",
    ),
]
