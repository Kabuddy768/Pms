from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import BuildingViewSet, OwnerViewSet, PropertyViewSet, UnitViewSet

router = DefaultRouter()
router.register("properties", PropertyViewSet, basename="property")
router.register("buildings", BuildingViewSet, basename="building")
router.register("units", UnitViewSet, basename="unit")
router.register("owners", OwnerViewSet, basename="owner")

urlpatterns = [
    path("", include(router.urls)),
]
