# pi-model-filter: filtro declarativo de modelos por provider no pi
#
# `make` ou `make help` lista os alvos. Este Makefile é uma fachada: cada alvo
# delega pra ferramenta de verdade (npm). Alvo novo entra com `## descrição` na
# mesma linha pra aparecer no help.

SHELL := bash
.SHELLFLAGS := -eu -o pipefail -c
MAKEFLAGS += --warn-undefined-variables --no-builtin-rules --no-print-directory
.DEFAULT_GOAL := help
.DELETE_ON_ERROR:

# ---------------------------------------------------------------------------
# Variáveis (?= permite sobrescrever: `make version VERSION=0.1.4`)
# ---------------------------------------------------------------------------

APP     ?= pi-model-filter
VERSION ?=

# Cores só quando stdout é um terminal (pipe e CI ficam limpos)
BOLD   :=
CYAN   :=
GREEN  :=
YELLOW :=
RESET  :=
ifneq ($(shell [ -t 1 ] && echo tty),)
  BOLD   := $(shell tput bold 2>/dev/null)
  CYAN   := $(shell tput setaf 6 2>/dev/null)
  GREEN  := $(shell tput setaf 2 2>/dev/null)
  YELLOW := $(shell tput setaf 3 2>/dev/null)
  RESET  := $(shell tput sgr0 2>/dev/null)
endif

##@ Geral

.PHONY: help
help: ## Lista os alvos disponíveis
	@awk 'BEGIN { FS = ":.*##"; printf "\n$(BOLD)$(APP)$(RESET)\n\nUso: make $(CYAN)<alvo>$(RESET)\n" } \
	  /^##@/ { printf "\n$(BOLD)%s$(RESET)\n", substr($$0, 5) } \
	  /^[a-zA-Z0-9_.\/-]+:.*?##/ { printf "  $(CYAN)%-18s$(RESET) %s\n", $$1, $$2 } \
	  END { printf "\n" }' $(MAKEFILE_LIST)

.PHONY: setup
setup: ## Instala as dependências a partir do lockfile
	@echo "$(GREEN)▸ setup$(RESET)"
	npm ci

.PHONY: fresh
fresh: clean setup ## clean + setup: reinstala tudo do zero

##@ Qualidade

.PHONY: lint
lint: ## Checa os tipos (tsc --noEmit; o projeto não tem linter)
	@echo "$(GREEN)▸ lint$(RESET)"
	npm run typecheck

.PHONY: test
test: ## Roda os testes (vitest)
	@echo "$(GREEN)▸ test$(RESET)"
	npm test

.PHONY: check
check: lint test build ## Exatamente o que o CI roda: lint, test, build
	@echo "$(GREEN)✓ check ok$(RESET)"

##@ Build

.PHONY: build
build: ## Compila TypeScript pra dist/
	@echo "$(GREEN)▸ build$(RESET)"
	npm run build

.PHONY: clean
clean: ## Remove dist/ e os caches locais
	@echo "$(GREEN)▸ clean$(RESET)"
	rm -rf dist coverage node_modules/.vite

##@ Release

.PHONY: version
version: ## Faz o bump (VERSION=0.1.4), sem commitar nem taguear
	@test -n "$(VERSION)" || { echo "$(YELLOW)uso: make version VERSION=x.y.z$(RESET)"; exit 1; }
	@echo "$(GREEN)▸ version $(VERSION)$(RESET)"
	npm version $(VERSION) --no-git-tag-version

.PHONY: pack
pack: ## Mostra o que iria no tarball, sem publicar
	@echo "$(GREEN)▸ pack$(RESET)"
	npm pack --dry-run

.PHONY: publish
publish: ## Publica no npm (o prepublishOnly roda typecheck, test e build)
	@echo "$(GREEN)▸ publish$(RESET)"
	npm publish
