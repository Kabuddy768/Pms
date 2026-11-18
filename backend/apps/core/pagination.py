from rest_framework.pagination import PageNumberPagination


class ConfigurablePageNumberPagination(PageNumberPagination):
    """Default 25-item pagination with client-configurable ?page_size= up to 200."""

    page_size = 25
    page_size_query_param = "page_size"
    max_page_size = 200
