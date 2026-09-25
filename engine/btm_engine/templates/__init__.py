"""Registry of industry templates. Add a new industry by creating a module here
with a module-level `TEMPLATE = IndustryTemplate(...)` and listing it below."""
from __future__ import annotations

from ..params import IndustryTemplate
from . import bakery, cafe, restaurant

TEMPLATES: dict[str, IndustryTemplate] = {
    cafe.TEMPLATE.id: cafe.TEMPLATE,
    restaurant.TEMPLATE.id: restaurant.TEMPLATE,
    bakery.TEMPLATE.id: bakery.TEMPLATE,
}


def get_template(industry: str) -> IndustryTemplate:
    try:
        return TEMPLATES[industry]
    except KeyError:
        raise ValueError(f"unknown industry {industry!r}; allowed: {sorted(TEMPLATES)}") from None


def list_industries() -> list[IndustryTemplate]:
    return list(TEMPLATES.values())


__all__ = ["TEMPLATES", "get_template", "list_industries"]
