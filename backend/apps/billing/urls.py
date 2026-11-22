from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import InvoiceViewSet, UtilityMeterReadingViewSet

router = DefaultRouter()
router.register("invoices", InvoiceViewSet, basename="invoice")
router.register("meter-readings", UtilityMeterReadingViewSet, basename="meter-reading")

urlpatterns = [
    path("", include(router.urls)),
]
