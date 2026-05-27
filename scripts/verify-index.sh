#!/usr/bin/env bash
# ── MindDock Knowledge Index Verification Script ──
# Usage: ./verify-index.sh <vault_path>
# Checks the integrity of the MindDock knowledge index.

set -euo pipefail

# ── Colors ──
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# ── Counters ──
PASS=0
FAIL=0
WARN=0

# ── Helpers ──
pass() {
  echo -e "${GREEN}[PASS]${NC} $1"
  PASS=$((PASS + 1))
}

fail() {
  echo -e "${RED}[FAIL]${NC} $1"
  FAIL=$((FAIL + 1))
}

warn() {
  echo -e "${YELLOW}[WARN]${NC} $1"
  WARN=$((WARN + 1))
}

info() {
  echo -e "${CYAN}[INFO]${NC} $1"
}

# ── Argument check ──
if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <vault_path>"
  echo "  vault_path  — Path to the MindDock vault directory (required)"
  exit 1
fi

VAULT_PATH="$1"
MINDDOCK_DIR="$VAULT_PATH/.minddock"
DB_PATH="$MINDDOCK_DIR/metadata.db"

# Validate vault path exists
if [[ ! -d "$VAULT_PATH" ]]; then
  fail "Vault path does not exist: $VAULT_PATH"
  echo ""
  echo -e "${RED}========================================${NC}"
  echo -e "${RED} Verification FAILED: $FAIL failure(s), $WARN warning(s), $PASS pass(es)${NC}"
  echo -e "${RED}========================================${NC}"
  exit 1
fi

info "Vault path: $VAULT_PATH"
info "MindDock dir: $MINDDOCK_DIR"
echo ""

# ── Dependency check ──
if ! command -v sqlite3 &>/dev/null; then
  fail "sqlite3 command not found. Please install sqlite3."
  exit 1
fi

if ! command -v jq &>/dev/null; then
  fail "jq command not found. Please install jq."
  exit 1
fi

# ══════════════════════════════════════════════════════════════
# CHECK 1: .minddock/metadata.db exists
# ══════════════════════════════════════════════════════════════
if [[ -f "$DB_PATH" ]]; then
  pass ".minddock/metadata.db exists"
else
  fail ".minddock/metadata.db does not exist at: $DB_PATH"
fi

# ══════════════════════════════════════════════════════════════
# CHECK 2: documents table has records
# ══════════════════════════════════════════════════════════════
if [[ -f "$DB_PATH" ]]; then
  DOC_COUNT=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM documents;" 2>/dev/null || echo "-1")
  if [[ "$DOC_COUNT" == "-1" ]]; then
    fail "documents table query failed (table may not exist)"
  elif [[ "$DOC_COUNT" -eq 0 ]]; then
    warn "documents table is empty (0 records)"
  else
    pass "documents table has $DOC_COUNT record(s)"
  fi
else
  warn "Skipping documents table check (DB not found)"
fi

# ══════════════════════════════════════════════════════════════
# CHECK 3: chunks_fts table is queryable
# ══════════════════════════════════════════════════════════════
if [[ -f "$DB_PATH" ]]; then
  FTS_COUNT=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM chunks_fts;" 2>/dev/null || echo "-1")
  if [[ "$FTS_COUNT" == "-1" ]]; then
    fail "chunks_fts table query failed (table may not exist or not a valid FTS5 table)"
  else
    pass "chunks_fts table is queryable ($FTS_COUNT record(s))"
  fi
else
  warn "Skipping chunks_fts check (DB not found)"
fi

# ══════════════════════════════════════════════════════════════
# CHECK 4: chunk_embeddings table has embeddings with coverage stats
# ══════════════════════════════════════════════════════════════
if [[ -f "$DB_PATH" ]]; then
  TOTAL_CHUNKS=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM chunks;" 2>/dev/null || echo "-1")
  TOTAL_EMBEDDINGS=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM chunk_embeddings;" 2>/dev/null || echo "-1")
  READY_EMBEDDINGS=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM chunk_embeddings WHERE embedding_status = 'ready';" 2>/dev/null || echo "-1")
  PENDING_EMBEDDINGS=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM chunk_embeddings WHERE embedding_status = 'pending';" 2>/dev/null || echo "-1")
  STALE_EMBEDDINGS=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM chunk_embeddings WHERE embedding_status = 'stale';" 2>/dev/null || echo "-1")
  UNAVAILABLE_EMBEDDINGS=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM chunk_embeddings WHERE embedding_status = 'unavailable';" 2>/dev/null || echo "-1")
  ERROR_EMBEDDINGS=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM chunk_embeddings WHERE embedding_status = 'error';" 2>/dev/null || echo "-1")

  if [[ "$TOTAL_EMBEDDINGS" == "-1" ]]; then
    fail "chunk_embeddings table query failed (table may not exist)"
  elif [[ "$TOTAL_EMBEDDINGS" -eq 0 ]]; then
    warn "chunk_embeddings table is empty (0 embeddings)"
  else
    if [[ "$TOTAL_CHUNKS" -gt 0 ]]; then
      COVERAGE=$(echo "scale=1; $READY_EMBEDDINGS * 100 / $TOTAL_CHUNKS" | bc 2>/dev/null || echo "N/A")
      pass "chunk_embeddings: $TOTAL_EMBEDDINGS total, $READY_EMBEDDINGS ready, $PENDING_EMBEDDINGS pending, $STALE_EMBEDDINGS stale, $UNAVAILABLE_EMBEDDINGS unavailable, $ERROR_EMBEDDINGS error (coverage: ${COVERAGE}% of $TOTAL_CHUNKS chunks)"
    else
      pass "chunk_embeddings: $TOTAL_EMBEDDINGS total, $READY_EMBEDDINGS ready, $PENDING_EMBEDDINGS pending, $STALE_EMBEDDINGS stale, $UNAVAILABLE_EMBEDDINGS unavailable, $ERROR_EMBEDDINGS error"
    fi
  fi
else
  warn "Skipping chunk_embeddings check (DB not found)"
fi

# ══════════════════════════════════════════════════════════════
# CHECK 5: embedding_model name exists in chunk_embeddings
# ══════════════════════════════════════════════════════════════
if [[ -f "$DB_PATH" ]]; then
  MODELS=$(sqlite3 "$DB_PATH" "SELECT DISTINCT embedding_model FROM chunk_embeddings WHERE embedding_model IS NOT NULL;" 2>/dev/null || echo "")
  if [[ -z "$MODELS" ]]; then
    warn "No embedding_model found in chunk_embeddings (no embeddings stored yet)"
  else
    pass "Embedding model(s) found: $(echo "$MODELS" | tr '\n' ', ' | sed 's/,$//')"
  fi
else
  warn "Skipping embedding_model check (DB not found)"
fi

# ══════════════════════════════════════════════════════════════
# CHECK 6: embedding_dimension is consistent (same model = same dimension)
# ══════════════════════════════════════════════════════════════
if [[ -f "$DB_PATH" ]]; then
  DIM_INCONSISTENCY=$(sqlite3 "$DB_PATH" "
    SELECT embedding_model, COUNT(DISTINCT embedding_dimension) as dim_count
    FROM chunk_embeddings
    WHERE embedding_model IS NOT NULL AND embedding_dimension IS NOT NULL
    GROUP BY embedding_model
    HAVING dim_count > 1;
  " 2>/dev/null || echo "")

  if [[ -n "$DIM_INCONSISTENCY" ]]; then
    fail "Inconsistent embedding_dimension for same model: $DIM_INCONSISTENCY"
  else
    # Show dimension per model
    DIMS=$(sqlite3 "$DB_PATH" "
      SELECT embedding_model, embedding_dimension, COUNT(*) as cnt
      FROM chunk_embeddings
      WHERE embedding_model IS NOT NULL AND embedding_dimension IS NOT NULL
      GROUP BY embedding_model, embedding_dimension;
    " 2>/dev/null || echo "")

    if [[ -n "$DIMS" ]]; then
      pass "Embedding dimension is consistent per model: $(echo "$DIMS" | tr '\n' '; ' | sed 's/;$//')"
    else
      warn "No embedding dimension data to check"
    fi
  fi
else
  warn "Skipping embedding_dimension consistency check (DB not found)"
fi

# ══════════════════════════════════════════════════════════════
# CHECK 7: embedding_content_hash matches current chunk content_hash
# (Detect stale embeddings)
# ══════════════════════════════════════════════════════════════
if [[ -f "$DB_PATH" ]]; then
  STALE_COUNT=$(sqlite3 "$DB_PATH" "
    SELECT COUNT(*)
    FROM chunks c
    JOIN chunk_embeddings ce ON c.id = ce.chunk_id
    WHERE ce.embedding_status = 'ready'
      AND c.content_hash IS NOT NULL
      AND ce.embedding_content_hash IS NOT NULL
      AND c.content_hash != ce.embedding_content_hash;
  " 2>/dev/null || echo "-1")

  if [[ "$STALE_COUNT" == "-1" ]]; then
    warn "Could not check stale embeddings (query failed)"
  elif [[ "$STALE_COUNT" -eq 0 ]]; then
    pass "No stale embeddings detected (all embedding_content_hash match chunk content_hash)"
  else
    fail "Found $STALE_COUNT stale embedding(s) (embedding_content_hash != chunk content_hash)"
    # Show details
    STALE_DETAILS=$(sqlite3 "$DB_PATH" "
      SELECT c.id, c.document_path, c.content_hash, ce.embedding_content_hash
      FROM chunks c
      JOIN chunk_embeddings ce ON c.id = ce.chunk_id
      WHERE ce.embedding_status = 'ready'
        AND c.content_hash IS NOT NULL
        AND ce.embedding_content_hash IS NOT NULL
        AND c.content_hash != ce.embedding_content_hash
      LIMIT 10;
    " 2>/dev/null || echo "")
    if [[ -n "$STALE_DETAILS" ]]; then
      info "Stale embedding details (chunk_id, document_path, chunk_hash, embedding_hash):"
      echo "$STALE_DETAILS" | while IFS='|' read -r cid dpath chash ehash; do
        info "  chunk_id=$cid doc=$dpath chunk_hash=$chash embedding_hash=$ehash"
      done
    fi
  fi
else
  warn "Skipping stale embedding check (DB not found)"
fi

# ══════════════════════════════════════════════════════════════
# CHECK 8: Verify semantic search unavailable state is clear when no embeddings exist
# ══════════════════════════════════════════════════════════════
if [[ -f "$DB_PATH" ]]; then
  READY_COUNT=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM chunk_embeddings WHERE embedding_status = 'ready';" 2>/dev/null || echo "0")
  UNAVAIL_COUNT=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM chunk_embeddings WHERE embedding_status = 'unavailable';" 2>/dev/null || echo "0")

  if [[ "$READY_COUNT" -eq 0 && "$UNAVAIL_COUNT" -gt 0 ]]; then
    warn "Semantic search is unavailable: $UNAVAIL_COUNT embedding(s) marked as 'unavailable', 0 ready embeddings"
  elif [[ "$READY_COUNT" -eq 0 ]]; then
    info "No ready embeddings — semantic search is not available (this is expected if embedding service is not configured)"
  else
    pass "Semantic search available: $READY_COUNT ready embedding(s)"
  fi
else
  warn "Skipping semantic search availability check (DB not found)"
fi

# ══════════════════════════════════════════════════════════════
# CHECK 9: Verify no fake vectors (all embedding BLOBs have correct size = dimension * 4 bytes)
# ══════════════════════════════════════════════════════════════
if [[ -f "$DB_PATH" ]]; then
  FAKE_VECTORS=$(sqlite3 "$DB_PATH" "
    SELECT ce.chunk_id, ce.embedding_dimension, LENGTH(ce.embedding) as blob_size
    FROM chunk_embeddings ce
    WHERE ce.embedding IS NOT NULL
      AND ce.embedding_dimension IS NOT NULL
      AND ce.embedding_status = 'ready'
      AND LENGTH(ce.embedding) != ce.embedding_dimension * 4;
  " 2>/dev/null || echo "")

  if [[ -n "$FAKE_VECTORS" ]]; then
    fail "Found embedding BLOB(s) with incorrect size (expected dimension * 4 bytes):"
    echo "$FAKE_VECTORS" | while IFS='|' read -r cid dim bsize; do
      info "  chunk_id=$cid dimension=$dim blob_size=$bsize (expected $((dim * 4)))"
    done
  else
    READY_WITH_DIM=$(sqlite3 "$DB_PATH" "
      SELECT COUNT(*)
      FROM chunk_embeddings
      WHERE embedding IS NOT NULL
        AND embedding_dimension IS NOT NULL
        AND embedding_status = 'ready';
    " 2>/dev/null || echo "0")

    if [[ "$READY_WITH_DIM" -eq 0 ]]; then
      info "No ready embeddings with dimension data to verify BLOB sizes"
    else
      pass "All $READY_WITH_DIM ready embedding BLOB(s) have correct size (dimension * 4 bytes)"
    fi
  fi

  # Also check for zero-length or NULL embeddings marked as ready
  ZERO_EMBEDDINGS=$(sqlite3 "$DB_PATH" "
    SELECT COUNT(*)
    FROM chunk_embeddings
    WHERE embedding_status = 'ready'
      AND (embedding IS NULL OR LENGTH(embedding) = 0);
  " 2>/dev/null || echo "0")

  if [[ "$ZERO_EMBEDDINGS" -gt 0 ]]; then
    fail "Found $ZERO_EMBEDDINGS embedding(s) marked as 'ready' with NULL or zero-length BLOB (fake vectors)"
  fi
else
  warn "Skipping fake vector check (DB not found)"
fi

# ══════════════════════════════════════════════════════════════
# CHECK 10: Verify reasoning model disabled doesn't break baseline
# (metadata/FTS/vector tables exist independently)
# ══════════════════════════════════════════════════════════════
if [[ -f "$DB_PATH" ]]; then
  TABLES_EXIST=true

  # Check documents table
  DOC_TABLE=$(sqlite3 "$DB_PATH" "SELECT name FROM sqlite_master WHERE type='table' AND name='documents';" 2>/dev/null || echo "")
  if [[ -z "$DOC_TABLE" ]]; then
    fail "documents table does not exist — baseline broken"
    TABLES_EXIST=false
  fi

  # Check chunks table
  CHUNKS_TABLE=$(sqlite3 "$DB_PATH" "SELECT name FROM sqlite_master WHERE type='table' AND name='chunks';" 2>/dev/null || echo "")
  if [[ -z "$CHUNKS_TABLE" ]]; then
    fail "chunks table does not exist — baseline broken"
    TABLES_EXIST=false
  fi

  # Check chunks_fts table
  FTS_TABLE=$(sqlite3 "$DB_PATH" "SELECT name FROM sqlite_master WHERE type='table' AND name='chunks_fts';" 2>/dev/null || echo "")
  if [[ -z "$FTS_TABLE" ]]; then
    fail "chunks_fts table does not exist — FTS baseline broken"
    TABLES_EXIST=false
  fi

  # Check chunk_embeddings table
  EMB_TABLE=$(sqlite3 "$DB_PATH" "SELECT name FROM sqlite_master WHERE type='table' AND name='chunk_embeddings';" 2>/dev/null || echo "")
  if [[ -z "$EMB_TABLE" ]]; then
    fail "chunk_embeddings table does not exist — vector index broken"
    TABLES_EXIST=false
  fi

  if [[ "$TABLES_EXIST" == true ]]; then
    pass "All core tables exist independently (metadata, FTS, vector) — baseline works even without reasoning model"
  fi
else
  fail "Cannot verify table independence (DB not found)"
fi

# ══════════════════════════════════════════════════════════════
# CHECK 11: Verify no dirty data after delete/rename
# (check for orphan chunks without matching documents)
# ══════════════════════════════════════════════════════════════
if [[ -f "$DB_PATH" ]]; then
  ORPHAN_CHUNKS=$(sqlite3 "$DB_PATH" "
    SELECT COUNT(*)
    FROM chunks c
    WHERE NOT EXISTS (
      SELECT 1 FROM documents d WHERE d.path = c.document_path
    );
  " 2>/dev/null || echo "-1")

  if [[ "$ORPHAN_CHUNKS" == "-1" ]]; then
    warn "Could not check orphan chunks (query failed)"
  elif [[ "$ORPHAN_CHUNKS" -eq 0 ]]; then
    pass "No orphan chunks found (all chunks reference existing documents)"
  else
    fail "Found $ORPHAN_CHUNKS orphan chunk(s) without matching documents"
    # Show details
    ORPHAN_DETAILS=$(sqlite3 "$DB_PATH" "
      SELECT c.id, c.document_path
      FROM chunks c
      WHERE NOT EXISTS (
        SELECT 1 FROM documents d WHERE d.path = c.document_path
      )
      LIMIT 10;
    " 2>/dev/null || echo "")
    if [[ -n "$ORPHAN_DETAILS" ]]; then
      info "Orphan chunk details (chunk_id, document_path):"
      echo "$ORPHAN_DETAILS" | while IFS='|' read -r cid dpath; do
        info "  chunk_id=$cid document_path=$dpath"
      done
    fi
  fi

  # Also check orphan embeddings (chunk_id references non-existent chunk)
  ORPHAN_EMBEDDINGS=$(sqlite3 "$DB_PATH" "
    SELECT COUNT(*)
    FROM chunk_embeddings ce
    WHERE NOT EXISTS (
      SELECT 1 FROM chunks c WHERE c.id = ce.chunk_id
    );
  " 2>/dev/null || echo "-1")

  if [[ "$ORPHAN_EMBEDDINGS" == "-1" ]]; then
    warn "Could not check orphan embeddings (query failed)"
  elif [[ "$ORPHAN_EMBEDDINGS" -eq 0 ]]; then
    pass "No orphan embeddings found (all embeddings reference existing chunks)"
  else
    fail "Found $ORPHAN_EMBEDDINGS orphan embedding(s) without matching chunks"
  fi
else
  warn "Skipping orphan data check (DB not found)"
fi

# ══════════════════════════════════════════════════════════════
# CHECK 12: Verify context pack source references exist
# (check .minddock/context-packs.json if it exists)
# ══════════════════════════════════════════════════════════════
CONTEXT_PACKS_FILE="$MINDDOCK_DIR/context-packs.json"
if [[ -f "$CONTEXT_PACKS_FILE" ]]; then
  # Validate it's valid JSON
  if jq empty "$CONTEXT_PACKS_FILE" 2>/dev/null; then
    # Check that document_path references in items exist in the documents table
    if [[ -f "$DB_PATH" ]]; then
      INVALID_REFS=$(jq -r '.[].items[].document_path // empty' "$CONTEXT_PACKS_FILE" 2>/dev/null | while read -r docpath; do
        EXISTS=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM documents WHERE path = '$docpath';" 2>/dev/null || echo "0")
        if [[ "$EXISTS" == "0" ]]; then
          echo "$docpath"
        fi
      done || true)

      if [[ -n "$INVALID_REFS" ]]; then
        INVALID_COUNT=$(echo "$INVALID_REFS" | wc -l | tr -d ' ')
        fail "context-packs.json has $INVALID_COUNT item(s) referencing non-existent document(s):"
        echo "$INVALID_REFS" | while read -r docpath; do
          info "  $docpath"
        done
      else
        pass "context-packs.json: all document_path references exist in documents table"
      fi
    else
      warn "Cannot verify context pack references (DB not found)"
    fi
  else
    fail "context-packs.json is not valid JSON"
  fi
else
  info "context-packs.json does not exist (skipped)"
fi

# ══════════════════════════════════════════════════════════════
# CHECK 13: Verify mentor-triggers.json exists and is valid JSON
# ══════════════════════════════════════════════════════════════
TRIGGERS_FILE="$MINDDOCK_DIR/mentor-triggers.json"
if [[ -f "$TRIGGERS_FILE" ]]; then
  if jq empty "$TRIGGERS_FILE" 2>/dev/null; then
    # Check structure: should have "entries" array
    ENTRIES_TYPE=$(jq -r '.entries | type' "$TRIGGERS_FILE" 2>/dev/null || echo "null")
    if [[ "$ENTRIES_TYPE" == "array" ]]; then
      ENTRY_COUNT=$(jq '.entries | length' "$TRIGGERS_FILE" 2>/dev/null || echo "0")
      pass "mentor-triggers.json is valid JSON with $ENTRY_COUNT entr(ies)"
    else
      fail "mentor-triggers.json is valid JSON but missing 'entries' array (found type: $ENTRIES_TYPE)"
    fi
  else
    fail "mentor-triggers.json is not valid JSON"
  fi
else
  info "mentor-triggers.json does not exist (skipped)"
fi

# ══════════════════════════════════════════════════════════════
# CHECK 14: Verify mentor-memory.json exists and is valid JSON
# ══════════════════════════════════════════════════════════════
MEMORY_FILE="$MINDDOCK_DIR/mentor-memory.json"
if [[ -f "$MEMORY_FILE" ]]; then
  if jq empty "$MEMORY_FILE" 2>/dev/null; then
    # Check structure: should be an array
    ROOT_TYPE=$(jq -r 'type' "$MEMORY_FILE" 2>/dev/null || echo "null")
    if [[ "$ROOT_TYPE" == "array" ]]; then
      MEM_COUNT=$(jq 'length' "$MEMORY_FILE" 2>/dev/null || echo "0")
      pass "mentor-memory.json is valid JSON (array with $MEM_COUNT entr(ies))"
    else
      fail "mentor-memory.json is valid JSON but root is not an array (found type: $ROOT_TYPE)"
    fi
  else
    fail "mentor-memory.json is not valid JSON"
  fi
else
  info "mentor-memory.json does not exist (skipped)"
fi

# ══════════════════════════════════════════════════════════════
# CHECK 15: Verify personalization-signals.jsonl exists and is valid JSONL
# ══════════════════════════════════════════════════════════════
SIGNALS_FILE="$MINDDOCK_DIR/personalization-signals.jsonl"
if [[ -f "$SIGNALS_FILE" ]]; then
  INVALID_LINES=0
  TOTAL_LINES=0
  while IFS= read -r line; do
    line=$(echo "$line" | xargs) # trim
    if [[ -z "$line" ]]; then
      continue
    fi
    ((TOTAL_LINES++))
    if ! echo "$line" | jq empty 2>/dev/null; then
      ((INVALID_LINES++))
      if [[ "$INVALID_LINES" -le 3 ]]; then
        info "  Invalid JSONL line: ${line:0:80}..."
      fi
    fi
  done < "$SIGNALS_FILE"

  if [[ "$TOTAL_LINES" -eq 0 ]]; then
    pass "personalization-signals.jsonl exists and is empty"
  elif [[ "$INVALID_LINES" -eq 0 ]]; then
    pass "personalization-signals.jsonl: all $TOTAL_LINES line(s) are valid JSON"
  else
    fail "personalization-signals.jsonl: $INVALID_LINES of $TOTAL_LINES line(s) are invalid JSON"
  fi
else
  info "personalization-signals.jsonl does not exist (skipped)"
fi

# ══════════════════════════════════════════════════════════════
# CHECK 16: Verify no mock context pack, no silent fallback, no fake vectors
# ══════════════════════════════════════════════════════════════
MOCK_FOUND=false

# Check for mock context packs
if [[ -f "$CONTEXT_PACKS_FILE" ]]; then
  MOCK_PACKS=$(jq -r '.[] | select(.name | test("mock|test|dummy|fake|sample"; "i")) | .name' "$CONTEXT_PACKS_FILE" 2>/dev/null || echo "")
  if [[ -n "$MOCK_PACKS" ]]; then
    fail "Found mock/test context pack(s): $(echo "$MOCK_PACKS" | tr '\n' ', ' | sed 's/,$//')"
    MOCK_FOUND=true
  fi
fi

# Check for fake vectors (zero-norm embeddings)
if [[ -f "$DB_PATH" ]]; then
  ZERO_NORM_COUNT=$(sqlite3 "$DB_PATH" "
    SELECT COUNT(*)
    FROM chunk_embeddings
    WHERE embedding_status = 'ready'
      AND embedding IS NOT NULL
      AND LENGTH(embedding) > 0;
  " 2>/dev/null || echo "0")

  if [[ "$ZERO_NORM_COUNT" -gt 0 ]]; then
    # We can't easily compute norms in sqlite3, but we already checked BLOB sizes above.
    # Check for embeddings with all-zero bytes (common fake vector pattern)
    # A 768-dim all-zero vector would be 3072 bytes of 0x00
    ALL_ZERO=$(sqlite3 "$DB_PATH" "
      SELECT COUNT(*)
      FROM chunk_embeddings
      WHERE embedding_status = 'ready'
        AND embedding = zeroblob(LENGTH(embedding))
        AND LENGTH(embedding) > 0;
    " 2>/dev/null || echo "0")

    if [[ "$ALL_ZERO" -gt 0 ]]; then
      fail "Found $ALL_ZERO all-zero embedding vector(s) (likely fake/mock vectors)"
      MOCK_FOUND=true
    fi
  fi
fi

# Check for silent fallback: embeddings marked 'ready' but with no model name
if [[ -f "$DB_PATH" ]]; then
  NO_MODEL_READY=$(sqlite3 "$DB_PATH" "
    SELECT COUNT(*)
    FROM chunk_embeddings
    WHERE embedding_status = 'ready'
      AND (embedding_model IS NULL OR embedding_model = '');
  " 2>/dev/null || echo "0")

  if [[ "$NO_MODEL_READY" -gt 0 ]]; then
    fail "Found $NO_MODEL_READY ready embedding(s) with no embedding_model (possible silent fallback)"
    MOCK_FOUND=true
  fi
fi

if [[ "$MOCK_FOUND" == false ]]; then
  pass "No mock context packs, no silent fallback, no fake vectors detected"
fi

# ══════════════════════════════════════════════════════════════
# Summary
# ══════════════════════════════════════════════════════════════
echo ""
echo "=========================================="
if [[ $FAIL -eq 0 ]]; then
  echo -e "${GREEN} Verification PASSED: $PASS pass(es), $WARN warning(s), $FAIL failure(s)${NC}"
else
  echo -e "${RED} Verification FAILED: $FAIL failure(s), $WARN warning(s), $PASS pass(es)${NC}"
fi
echo "=========================================="

if [[ $FAIL -gt 0 ]]; then
  exit 1
fi

exit 0
