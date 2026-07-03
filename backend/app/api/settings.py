"""Settings endpoints — GET to read, PATCH to update."""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.schemas import SettingsOut, SettingsPatch, SettingsPatchResponse
from app.config import (
    EMBEDDING_AFFECTING_KEYS,
    ENV_ONLY_KEYS,
    SENSITIVE_KEYS,
    decrypt_value,
    encrypt_value,
    get_runtime_settings,
    load_db_overrides,
    settings_to_display,
)
from app.database import get_db
from app.llm.client import clear_llm_cache
from app.models import AppSetting
from app.retrieval.embeddings import clear_embedder_cache
from app.retrieval.rerank import clear_reranker_cache
from app.retrieval.search import clear_opensearch_cache

router = APIRouter(prefix="/settings", tags=["settings"])


async def _load_overrides_from_db(db: AsyncSession) -> dict[str, str]:
    """Read all AppSetting rows and return decrypted plaintext overrides."""
    result = await db.execute(select(AppSetting))
    rows = result.scalars().all()
    overrides: dict[str, str] = {}
    for row in rows:
        value = decrypt_value(row.value) if row.key in SENSITIVE_KEYS else row.value
        overrides[row.key] = value
    return overrides


@router.get("", response_model=SettingsOut)
async def get_settings_endpoint(db: AsyncSession = Depends(get_db)) -> SettingsOut:
    # Re-sync overrides from DB on each read to stay consistent.
    overrides = await _load_overrides_from_db(db)
    load_db_overrides(overrides)
    s = get_runtime_settings()
    display = settings_to_display(s)
    return SettingsOut(**display)


@router.patch("", response_model=SettingsPatchResponse)
async def patch_settings(
    data: SettingsPatch,
    db: AsyncSession = Depends(get_db),
) -> SettingsPatchResponse:
    patch_dict = data.model_dump(exclude_none=True)

    # Filter out ENV-only keys (should not be settable via API)
    for key in list(patch_dict.keys()):
        if key in ENV_ONLY_KEYS:
            del patch_dict[key]

    current_settings = get_runtime_settings()
    warnings: list[str] = []

    # Check if any embedding-affecting key is changing
    embedding_changed = any(k in EMBEDDING_AFFECTING_KEYS for k in patch_dict)
    if embedding_changed:
        warnings.append(
            "Embedding configuration changed. Existing sources must be re-processed "
            "for the new settings to take effect."
        )

    # Persist each updated key to DB
    for key, value in patch_dict.items():
        stored_value = encrypt_value(str(value)) if key in SENSITIVE_KEYS else str(value)
        existing = await db.get(AppSetting, key)
        if existing:
            existing.value = stored_value
        else:
            db.add(AppSetting(key=key, value=stored_value))

    await db.commit()

    # Reload overrides into the in-memory cache
    overrides = await _load_overrides_from_db(db)
    load_db_overrides(overrides)

    # Clear dependent caches so next call picks up new settings
    clear_llm_cache()
    clear_embedder_cache()
    clear_reranker_cache()
    if any(
        k in {
            "opensearch_user",
            "opensearch_password",
            "opensearch_index",
            "opensearch_use_search_pipeline",
            "opensearch_search_pipeline",
        }
        for k in patch_dict
    ):
        clear_opensearch_cache()

    s = get_runtime_settings()
    display = settings_to_display(s)
    return SettingsPatchResponse(settings=SettingsOut(**display), warnings=warnings)
