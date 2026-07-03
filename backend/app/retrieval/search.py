"""OpenSearch index management and hybrid search."""
from __future__ import annotations

import logging
from functools import lru_cache
from typing import Any

from opensearchpy import OpenSearch, helpers

from app.config import get_runtime_settings

logger = logging.getLogger(__name__)

_INDEX_MAPPING = {
    "settings": {"index.knn": True},
    "mappings": {
        "properties": {
            "source_id": {"type": "keyword"},
            "source_title": {"type": "text"},
            "notebook_id": {"type": "keyword"},
            "page_number": {"type": "integer"},
            "chunk_index": {"type": "integer"},
            "text": {"type": "text", "analyzer": "standard"},
            "embedding": {
                "type": "knn_vector",
                "dimension": None,  # filled at runtime
                "method": {
                    "name": "hnsw",
                    "engine": "lucene",
                    "space_type": "cosinesimil",
                },
            },
            "created_at": {"type": "date"},
        }
    },
}


@lru_cache(maxsize=1)
def get_opensearch_client() -> OpenSearch:
    s = get_runtime_settings()
    return OpenSearch(
        hosts=[{"host": s.opensearch_host, "port": s.opensearch_port}],
        http_auth=(s.opensearch_user, s.opensearch_password),
        use_ssl=False,
        verify_certs=False,
        ssl_show_warn=False,
    )


def clear_opensearch_cache() -> None:
    get_opensearch_client.cache_clear()


def ensure_index(client: OpenSearch) -> None:
    s = get_runtime_settings()
    index = s.opensearch_index
    if client.indices.exists(index=index):
        return

    mapping = dict(_INDEX_MAPPING)
    mapping["mappings"] = dict(_INDEX_MAPPING["mappings"])
    mapping["mappings"]["properties"] = dict(_INDEX_MAPPING["mappings"]["properties"])
    # Patch dimension
    mapping["mappings"]["properties"]["embedding"] = {
        **_INDEX_MAPPING["mappings"]["properties"]["embedding"],
        "dimension": s.embedding_dimension,
    }

    client.indices.create(index=index, body=mapping)
    logger.info("Created OpenSearch index: %s", index)


def bulk_index_chunks(client: OpenSearch, chunks: list[dict]) -> None:
    s = get_runtime_settings()
    actions = [
        {
            "_index": s.opensearch_index,
            "_id": f"{c['source_id']}_{c['chunk_index']}",
            "_source": c,
        }
        for c in chunks
    ]
    success, errors = helpers.bulk(client, actions, raise_on_error=False)
    if errors:
        logger.warning("Bulk index errors: %s", errors[:5])
    logger.info("Bulk indexed %d chunks", success)


def delete_source_chunks(client: OpenSearch, source_id: str) -> None:
    s = get_runtime_settings()
    client.delete_by_query(
        index=s.opensearch_index,
        body={"query": {"term": {"source_id": source_id}}},
    )


def hybrid_search(
    client: OpenSearch,
    notebook_id: str,
    query_text: str,
    query_embedding: list[float],
    top_k: int = 10,
    bm25_weight: float = 0.3,
    knn_weight: float = 0.7,
) -> list[dict[str, Any]]:
    """Hybrid search: OpenSearch search pipeline, with client-side fallback.

    Uses OpenSearch hybrid+pipeline when enabled; falls back to client merge.
    """
    s = get_runtime_settings()
    if s.opensearch_use_search_pipeline:
        try:
            return _hybrid_search_with_pipeline(
                client=client,
                notebook_id=notebook_id,
                query_text=query_text,
                query_embedding=query_embedding,
                top_k=top_k,
                bm25_weight=bm25_weight,
                knn_weight=knn_weight,
                pipeline_name=s.opensearch_search_pipeline,
            )
        except Exception:
            logger.exception(
                "Search pipeline hybrid query failed; falling back to client merge"
            )

    return _hybrid_search_fallback(
        client=client,
        notebook_id=notebook_id,
        query_text=query_text,
        query_embedding=query_embedding,
        top_k=top_k,
        bm25_weight=bm25_weight,
        knn_weight=knn_weight,
    )


def _hybrid_search_with_pipeline(
    client: OpenSearch,
    notebook_id: str,
    query_text: str,
    query_embedding: list[float],
    top_k: int,
    bm25_weight: float,
    knn_weight: float,
    pipeline_name: str,
) -> list[dict[str, Any]]:
    s = get_runtime_settings()
    index = s.opensearch_index
    _ensure_search_pipeline(client, pipeline_name, bm25_weight, knn_weight)

    hybrid_query = {
        "size": top_k,
        "query": {
            "hybrid": {
                "queries": [
                    {"match": {"text": {"query": query_text}}},
                    {"knn": {"embedding": {"vector": query_embedding, "k": top_k * 2}}},
                ]
            }
        },
        "post_filter": {"term": {"notebook_id": notebook_id}},
    }
    resp = client.search(
        index=index,
        body=hybrid_query,
        params={"search_pipeline": pipeline_name},
    )
    hits = resp["hits"]["hits"]
    return [{**h["_source"], "_score": h.get("_score", 0.0), "_id": h["_id"]} for h in hits]


def _ensure_search_pipeline(
    client: OpenSearch,
    pipeline_name: str,
    bm25_weight: float,
    knn_weight: float,
) -> None:
    # Idempotent upsert to keep weights in sync with runtime config.
    body = {
        "description": "Hybrid retrieval pipeline with score normalization",
        "phase_results_processors": [
            {
                "normalization-processor": {
                    "normalization": {"technique": "min_max"},
                    "combination": {
                        "technique": "arithmetic_mean",
                        "parameters": {"weights": [bm25_weight, knn_weight]},
                    },
                }
            }
        ],
    }
    client.transport.perform_request(
        method="PUT",
        url=f"/_search/pipeline/{pipeline_name}",
        body=body,
    )


def _hybrid_search_fallback(
    client: OpenSearch,
    notebook_id: str,
    query_text: str,
    query_embedding: list[float],
    top_k: int,
    bm25_weight: float,
    knn_weight: float,
) -> list[dict[str, Any]]:
    s = get_runtime_settings()
    index = s.opensearch_index
    filter_clause = {"term": {"notebook_id": notebook_id}}

    # ── BM25 search ──────────────────────────────────────────────────────────
    bm25_query = {
        "size": top_k * 2,
        "query": {
            "bool": {
                "must": {"match": {"text": query_text}},
                "filter": filter_clause,
            }
        },
    }
    bm25_resp = client.search(index=index, body=bm25_query)
    bm25_hits = bm25_resp["hits"]["hits"]
    bm25_max = max((h["_score"] for h in bm25_hits), default=1.0) or 1.0

    # ── kNN search ────────────────────────────────────────────────────────────
    knn_query = {
        "size": top_k * 2,
        "query": {
            "bool": {
                "must": {
                    "knn": {
                        "embedding": {
                            "vector": query_embedding,
                            "k": top_k * 2,
                        }
                    }
                },
                "filter": filter_clause,
            }
        },
    }
    knn_resp = client.search(index=index, body=knn_query)
    knn_hits = knn_resp["hits"]["hits"]
    knn_max = max((h["_score"] for h in knn_hits), default=1.0) or 1.0

    # ── Merge and normalise ───────────────────────────────────────────────────
    scores: dict[str, float] = {}
    docs: dict[str, dict] = {}

    for hit in bm25_hits:
        doc_id = hit["_id"]
        scores[doc_id] = scores.get(doc_id, 0.0) + bm25_weight * (
            hit["_score"] / bm25_max
        )
        docs[doc_id] = hit["_source"]

    for hit in knn_hits:
        doc_id = hit["_id"]
        scores[doc_id] = scores.get(doc_id, 0.0) + knn_weight * (
            hit["_score"] / knn_max
        )
        docs[doc_id] = hit["_source"]

    ranked = sorted(scores.items(), key=lambda x: x[1], reverse=True)[:top_k]
    return [
        {**docs[doc_id], "_score": score, "_id": doc_id}
        for doc_id, score in ranked
    ]
