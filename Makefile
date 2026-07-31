.PHONY: build test lint fmt fmt-check fix dev-up dev-down publish-module help

BIN := .venv/bin
PYTHON := $(BIN)/python3 || python3

# ── Help ────────────────────────────────────────────────────────────────
help:  ## Show available targets
	@echo "SpacetimeTV — Development Commands"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

# ── Backend ─────────────────────────────────────────────────────────────
build: setup-git-hooks ## Build everything (install deps, build frontend)
	cd server && pip install -r requirements.txt
	cd web && npm install && npm run build

test:  ## Run all tests (backend + frontend, offline-safe)
	cd web && npm test
	cd server && python3 -m pytest tests/ -v -x --ignore=tests/test_live.py 2>/dev/null || python -m pytest tests/ -v -x --ignore=tests/test_live.py

test-backend:  ## Run backend tests only
	cd server && python3 -m pytest tests/ -v --ignore=tests/test_live.py 2>/dev/null || python -m pytest tests/ -v --ignore=tests/test_live.py

test-frontend:  ## Run frontend tests only
	cd web && npm test

test-all: test-backend test-frontend  ## Run full test suite

lint: lint-backend lint-frontend  ## Lint all code

lint-backend:  ## Lint backend Python with ruff
	cd server && (ruff check . || ~/.local/bin/ruff check .)

lint-frontend:  ## Lint frontend TypeScript with eslint
	cd web && npm run lint

fmt: fmt-backend fmt-frontend  ## Format all code

fmt-backend:  ## Format backend Python with ruff
	cd server && ruff format . 2>/dev/null || ~/.local/bin/ruff format . 2>/dev/null || echo "ruff not installed — run: pip install ruff"

fmt-frontend:  ## Format frontend with Prettier
	cd web && npx prettier --write src/ 2>/dev/null || echo "Install prettier for TS formatting"

fmt-check: fmt-check-backend fmt-check-frontend  ## Check formatting (read-only, fails on violations)

fmt-check-backend:  ## Check backend formatting with ruff
	cd server && (ruff format --check . || ~/.local/bin/ruff format --check .)

fmt-check-frontend:  ## Check frontend formatting with Prettier
	cd web && npx prettier --check src/

fix: lint fmt  ## Fix all auto-fixable issues

# ── Dev Environment ─────────────────────────────────────────────────────
dev-up:  ## Start development environment
	@echo "Starting backend on :8720..."
	cd server && python3 main.py &
	@sleep 2
	@echo "Starting frontend on :5183..."
	cd web && npm run dev &
	@echo ""
	@echo "Backend:  http://localhost:8720"
	@echo "Frontend: http://localhost:5183"

dev-down:  ## Stop development servers
	-pkill -f "python3 main.py" 2>/dev/null; echo "Backend stopped"
	-pkill -f "vite" 2>/dev/null; echo "Frontend stopped"

# ── Docker ──────────────────────────────────────────────────────────────
docker-build:  ## Build Docker images
	docker compose build

docker-up:  ## Start all services via docker-compose
	docker compose up -d
	@echo "Frontend: http://localhost:8722"

docker-down:  ## Stop all services
	docker compose down

# ── Cleanup ─────────────────────────────────────────────────────────────
clean:  ## Clean build artifacts
	rm -rf web/dist
	rm -rf server/__pycache__ server/routes/__pycache__ server/tests/__pycache__
	rm -rf .coverage .pytest_cache
	find . -name '*.pyc' -delete
	find . -name '*.pyo' -delete

# ── Agent-Friendly Targets ──────────────────────────────────────────────
test-unit: test-frontend test-backend  ## Run unit tests (offline-safe, fast)

test-integration:  ## Run integration tests (needs running server)
	@echo "Backend integration tests: start server first, then:"
	@echo "  cd server && python -m pytest tests/ -m integration -v"

test-quick:  ## Quick sanity check (~5s)
	cd web && npx vitest run --reporter=dot src/lib/utils.test.ts 2>/dev/null; true
	cd server && python3 -c "import fastapi; print('fastapi:', fastapi.__version__)" 2>/dev/null || python -c "import fastapi; print('fastapi:', fastapi.__version__)"

coverage:  ## Run tests with coverage
	cd server && python3 -m pytest tests/ --ignore=tests/test_live.py --cov=. --cov-report=term --cov-report=html 2>/dev/null || echo "Install pytest-cov for coverage"

check-ports:  ## Verify required ports are available
	@for port in 8720 5183 8722; do \
		if ss -tlnp "sport = :$$port" 2>/dev/null | grep -q .; then \
			echo "✅ Port $$port is in use"; \
		else \
			echo "❌ Port $$port is NOT in use (should be running)"; \
		fi; \
	done

deps-check:  ## Verify required tools are installed
	@echo "Checking dependencies..."
	@which python3 >/dev/null 2>&1 && echo "✅ python3" || echo "❌ python3 (install Python 3.12+)"
	@which node >/dev/null 2>&1 && echo "✅ node" || echo "❌ node (install Node.js 20+)"
	@which npm >/dev/null 2>&1 && echo "✅ npm" || echo "❌ npm"
	@which ffmpeg >/dev/null 2>&1 && echo "✅ ffmpeg" || echo "❌ ffmpeg (install for VOD remux)"
	@python3 -c "import fastapi" 2>/dev/null && echo "✅ fastapi" || echo "❌ fastapi (pip install)"

health:  ## Check if dev servers are running
	@echo "Backend:"
	@curl -s -o /dev/null -w "%{http_code}" http://localhost:8720/api/health 2>/dev/null && echo " :8720" || echo "❌ :8720 not responding"
	@echo "Frontend:"
	@curl -s -o /dev/null -w "%{http_code}" http://localhost:5183 2>/dev/null && echo " :5183" || echo "❌ :5183 not responding"

setup-git-hooks:  ## Install pre-commit hooks
	@mkdir -p .githooks
	@git config core.hooksPath .githooks
	@echo "✅ Git hooks configured (.githooks/)"
