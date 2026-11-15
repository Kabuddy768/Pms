from django.urls import path

from .views import LoginTokenView, MeView, RefreshTokenView, RegisterView

urlpatterns = [
    path("register/", RegisterView.as_view(), name="auth-register"),
    path("token/", LoginTokenView.as_view(), name="auth-token"),
    path("token/refresh/", RefreshTokenView.as_view(), name="auth-token-refresh"),
    path("me/", MeView.as_view(), name="auth-me"),
]
