from django.urls import path

from .views import (
    CurrentOrganizationView,
    OrganizationListCreateView,
    OrganizationMemberDetailView,
    OrganizationMemberListCreateView,
)

urlpatterns = [
    path("", OrganizationListCreateView.as_view(), name="organization-list-create"),
    path("current/", CurrentOrganizationView.as_view(), name="organization-current"),
    path("members/", OrganizationMemberListCreateView.as_view(), name="organization-members"),
    path(
        "members/<uuid:member_id>/",
        OrganizationMemberDetailView.as_view(),
        name="organization-member-detail",
    ),
]
