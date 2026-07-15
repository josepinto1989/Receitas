"use strict";

const CATEGORIES = {
  entradas: { label: "Entradas", short: "Entradas" },
  "pratos-principais": { label: "Pratos principais", short: "Pratos" },
  sobremesas: { label: "Sobremesas", short: "Sobremesas" }
};

const STORAGE = {
  planner: "miguel-recipes-planner-v3",
  checked: "miguel-recipes-shopping-v3"
};

const state = {
  recipes: [],
  site: {
    name: "À Mesa com o Miguel",
    shortName: "Receitas do Miguel",
    eyebrow: "Receitas testadas em casa",
    tagline: "Cozinha sem complicações, com sabor e vontade de repetir.",
    intro: "Uma coleção pessoal de receitas honestas, explicadas passo a passo e pensadas para reunir pessoas à mesa.",
    footer: "Receitas testadas em casa, feitas para partilhar."
  },
  query: "",
  category: "todas",
  maxTime: "all",
  difficulty: "all",
  selectedTags: new Set(),
  planner: new Set(),
  checked: new Set(),
  cookIndex: 0,
  cookRecipe: null,
  wakeLock: null
};

const app = document.querySelector("#app");
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalise(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function safePhotoPath(value) {
  const path = String(value ?? "").trim().replace(/^\.\//, "").replace(/^\//, "");
  if (!path || path.includes("..")) return "";
  return /^assets\/photos\/[^<>"']+\.(avif|jpe?g|png|webp)$/i.test(path) ? path : "";
}

function categoryLabel(key) {
  return CATEGORIES[key]?.label ?? "Receita";
}

function maximumMinutes(value) {
  const numbers = String(value ?? "").match(/\d+/g);
  return numbers ? Math.max(...numbers.map(Number)) : Number.POSITIVE_INFINITY;
}

function ratingText(value) {
  const rating = Number(value) || 0;
  return rating ? `${rating}/5 Miguelin` : "Por classificar";
}

function recipeSearchText(recipe) {
  return normalise([
    recipe.title,
    recipe.category,
    recipe.intro,
    recipe.difficulty,
    recipe.servings,
    recipe.time,
    ...(recipe.ingredients ?? []),
    ...(recipe.steps ?? []),
    ...(recipe.tips ?? []),
    ...(recipe.tags ?? [])
  ].join(" "));
}

function visibleRecipes() {
  const query = normalise(state.query);
  return state.recipes.filter((recipe) => {
    const hasQuery = !query || recipeSearchText(recipe).includes(query);
    const hasCategory = state.category === "todas" || recipe.category === state.category;
    const withinTime = state.maxTime === "all" || maximumMinutes(recipe.time) <= Number(state.maxTime);
    const hasDifficulty = state.difficulty === "all" || normalise(recipe.difficulty) === state.difficulty;
    const hasTags = [...state.selectedTags].every((tag) => (recipe.tags ?? []).includes(tag));
    return hasQuery && hasCategory && withinTime && hasDifficulty && hasTags;
  });
}

function allTags() {
  return [...new Set(state.recipes.flatMap((recipe) => recipe.tags ?? []))]
    .sort((a, b) => a.localeCompare(b, "pt"));
}

function mediaMarkup(recipe, className = "") {
  const photo = safePhotoPath(recipe.photo);
  if (photo) {
    return `<img class="${escapeHtml(className)}" src="${escapeHtml(photo)}" alt="${escapeHtml(recipe.title)}" loading="lazy" data-recipe-image data-letter="${escapeHtml(recipe.title?.charAt(0) || "M")}" data-category="${escapeHtml(recipe.category)}">`;
  }
  return placeholderMarkup(recipe);
}

function placeholderMarkup(recipe) {
  return `<div class="media-placeholder" data-letter="${escapeHtml(recipe.title?.charAt(0) || "M")}" data-category="${escapeHtml(recipe.category)}" role="img" aria-label="Fotografia de ${escapeHtml(recipe.title)} ainda não disponível"></div>`;
}

function recipeCard(recipe) {
  const selected = state.planner.has(recipe.id);
  return `
    <article class="recipe-card">
      <a class="recipe-media" href="#receita/${encodeURIComponent(recipe.id)}" aria-label="Ver ${escapeHtml(recipe.title)}">
        ${mediaMarkup(recipe)}
      </a>
      <div class="recipe-body">
        <p class="recipe-kicker">${escapeHtml(categoryLabel(recipe.category))}</p>
        <h3><a href="#receita/${encodeURIComponent(recipe.id)}">${escapeHtml(recipe.title)}</a></h3>
        <p class="recipe-intro">${escapeHtml(recipe.intro)}</p>
        <div class="recipe-meta" aria-label="Informação da receita">
          <span>${escapeHtml(recipe.time)}</span>
          <span>${escapeHtml(recipe.difficulty)}</span>
          <span class="rating">${escapeHtml(ratingText(recipe.miguelin))}</span>
        </div>
        <div class="card-actions">
          <a class="button button-primary button-small" href="#receita/${encodeURIComponent(recipe.id)}">Ver receita</a>
          <button class="button button-secondary button-small save-button ${selected ? "is-selected" : ""}" type="button" data-plan="${escapeHtml(recipe.id)}" aria-pressed="${selected}">
            ${selected ? "Na lista" : "+ Compras"}
          </button>
        </div>
      </div>
    </article>`;
}

function featuredRecipe() {
  return state.recipes.find((recipe) => recipe.featured) ??
    [...state.recipes].sort((a, b) => (b.miguelin ?? 0) - (a.miguelin ?? 0))[0];
}

function renderHome({ focusSearch = false } = {}) {
  const results = visibleRecipes();
  const featured = featuredRecipe();
  const searchPosition = focusSearch && $("#recipe-search") ? $("#recipe-search").selectionStart : null;
  const hasFilters = state.query || state.category !== "todas" || state.maxTime !== "all" || state.difficulty !== "all" || state.selectedTags.size;
  const categoryButtons = [
    ["todas", "Todas"],
    ...Object.entries(CATEGORIES).map(([key, value]) => [key, value.label])
  ];

  setPageMeta(state.site.name, state.site.tagline);
  app.innerHTML = `
    <section class="hero" id="inicio">
      <div class="hero-inner">
        <div class="hero-copy">
          <p class="eyebrow">${escapeHtml(state.site.eyebrow)}</p>
          <h1>${escapeHtml(state.site.tagline)}</h1>
          <p class="lead">${escapeHtml(state.site.intro)}</p>
          <div class="hero-actions">
            <a class="button button-primary" href="#receitas">Explorar receitas</a>
            ${featured ? `<a class="button button-secondary" href="#receita/${encodeURIComponent(featured.id)}">Sugestão do Miguel</a>` : ""}
          </div>
        </div>
        ${featured ? `
          <a class="featured-card" href="#receita/${encodeURIComponent(featured.id)}">
            <div class="featured-media">
              ${mediaMarkup(featured)}
              <span class="featured-badge">Receita em destaque</span>
            </div>
            <div class="featured-copy">
              <p class="recipe-kicker">${escapeHtml(categoryLabel(featured.category))} · ${escapeHtml(featured.time)}</p>
              <h2>${escapeHtml(featured.title)}</h2>
              <p>${escapeHtml(featured.intro)}</p>
            </div>
          </a>` : ""}
      </div>
    </section>

    <section class="content-shell" id="receitas">
      <div class="section-heading">
        <div>
          <p class="eyebrow">O livro de receitas</p>
          <h2>Encontra o que te apetece</h2>
          <p>Pesquisa por prato ou ingrediente e usa os filtros para chegares depressa à receita certa.</p>
        </div>
        <span class="recipe-total" aria-live="polite">${results.length} ${results.length === 1 ? "receita" : "receitas"}</span>
      </div>

      <div class="filter-panel">
        <div class="filter-top">
          <div class="search-box">
            <label class="sr-only" for="recipe-search">Pesquisar receitas</label>
            <input id="recipe-search" type="search" value="${escapeHtml(state.query)}" placeholder="Ex.: camarão, arroz, vegetariano…" autocomplete="off">
            ${state.query ? '<button class="search-clear" id="clear-search" type="button" aria-label="Limpar pesquisa">×</button>' : ""}
          </div>
          ${hasFilters ? '<button class="button button-quiet" id="clear-filters" type="button">Limpar filtros</button>' : ""}
        </div>
        <div class="category-tabs" aria-label="Filtrar por categoria">
          ${categoryButtons.map(([key, label]) => `
            <button class="category-tab" type="button" data-category="${key}" aria-pressed="${state.category === key}">
              ${escapeHtml(label)}
            </button>`).join("")}
        </div>
        <details class="advanced-filters" ${state.maxTime !== "all" || state.difficulty !== "all" || state.selectedTags.size ? "open" : ""}>
          <summary>Mais filtros</summary>
          <div class="advanced-grid">
            <label class="field-label">Tempo máximo
              <select id="time-filter">
                <option value="all">Qualquer duração</option>
                ${[15, 30, 45, 60].map((minutes) => `<option value="${minutes}" ${state.maxTime === String(minutes) ? "selected" : ""}>Até ${minutes} min</option>`).join("")}
              </select>
            </label>
            <label class="field-label">Dificuldade
              <select id="difficulty-filter">
                <option value="all">Todas</option>
                <option value="muito facil" ${state.difficulty === "muito facil" ? "selected" : ""}>Muito fácil</option>
                <option value="facil" ${state.difficulty === "facil" ? "selected" : ""}>Fácil</option>
                <option value="medio" ${state.difficulty === "medio" ? "selected" : ""}>Médio</option>
                <option value="dificil" ${state.difficulty === "dificil" ? "selected" : ""}>Difícil</option>
              </select>
            </label>
            <div>
              <span class="field-label">Características</span>
              <div class="filter-chips">
                ${allTags().map((tag) => `<button class="filter-chip" type="button" data-tag="${escapeHtml(tag)}" aria-pressed="${state.selectedTags.has(tag)}">${escapeHtml(tag)}</button>`).join("")}
              </div>
            </div>
          </div>
        </details>
      </div>

      <div class="recipe-grid">
        ${results.length ? results.map(recipeCard).join("") : `
          <div class="empty-state">
            <h3>Não encontrei nenhuma receita</h3>
            <p>Experimenta pesquisar por outro ingrediente ou remove alguns filtros.</p>
            <button class="button button-primary" id="empty-clear" type="button">Ver todas as receitas</button>
          </div>`}
      </div>
    </section>`;

  bindHomeEvents();
  bindImageFallbacks();
  updatePlanCount();

  if (focusSearch) {
    const search = $("#recipe-search");
    search?.focus();
    const position = searchPosition ?? search?.value.length ?? 0;
    search?.setSelectionRange(position, position);
  }
}

function bindHomeEvents() {
  $("#recipe-search")?.addEventListener("input", (event) => {
    state.query = event.target.value;
    renderHome({ focusSearch: true });
  });
  $("#clear-search")?.addEventListener("click", () => {
    state.query = "";
    renderHome({ focusSearch: true });
  });
  $("#clear-filters")?.addEventListener("click", clearFilters);
  $("#empty-clear")?.addEventListener("click", clearFilters);
  $("#time-filter")?.addEventListener("change", (event) => {
    state.maxTime = event.target.value;
    renderHome();
  });
  $("#difficulty-filter")?.addEventListener("change", (event) => {
    state.difficulty = event.target.value;
    renderHome();
  });
  $$('.category-tab[data-category]').forEach((button) => button.addEventListener("click", () => {
    state.category = button.dataset.category;
    renderHome();
  }));
  $$('.filter-chip[data-tag]').forEach((button) => button.addEventListener("click", () => {
    const tag = button.dataset.tag;
    state.selectedTags.has(tag) ? state.selectedTags.delete(tag) : state.selectedTags.add(tag);
    renderHome();
  }));
  bindPlanButtons();
}

function clearFilters() {
  state.query = "";
  state.category = "todas";
  state.maxTime = "all";
  state.difficulty = "all";
  state.selectedTags.clear();
  renderHome();
}

function renderDetail(id) {
  const recipe = state.recipes.find((item) => item.id === id);
  if (!recipe) {
    renderNotFound();
    return;
  }

  const selected = state.planner.has(recipe.id);
  setPageMeta(`${recipe.title} — ${state.site.name}`, recipe.intro);
  app.innerHTML = `
    <article class="detail-shell">
      <a class="back-link" href="#receitas">← Voltar às receitas</a>
      <div class="detail-hero">
        <div class="detail-copy">
          <p class="eyebrow">${escapeHtml(categoryLabel(recipe.category))}</p>
          <h1>${escapeHtml(recipe.title)}</h1>
          <p class="detail-intro">${escapeHtml(recipe.intro)}</p>
          <dl class="detail-meta">
            <div><dt>Tempo</dt><dd>${escapeHtml(recipe.time)}</dd></div>
            <div><dt>Doses</dt><dd>${escapeHtml(recipe.servings)}</dd></div>
            <div><dt>Dificuldade</dt><dd>${escapeHtml(recipe.difficulty)}</dd></div>
            <div><dt>Classificação</dt><dd>${escapeHtml(ratingText(recipe.miguelin))}</dd></div>
          </dl>
          <div class="detail-actions">
            <button class="button button-primary" type="button" id="start-cook">Iniciar modo cozinhar</button>
            <button class="button button-secondary save-button ${selected ? "is-selected" : ""}" type="button" data-plan="${escapeHtml(recipe.id)}" aria-pressed="${selected}">${selected ? "Remover das compras" : "Adicionar às compras"}</button>
            <button class="button button-quiet" type="button" id="print-recipe">Imprimir</button>
          </div>
        </div>
        <div class="detail-media">${mediaMarkup(recipe)}</div>
      </div>

      <div class="detail-content">
        <aside class="ingredients-card">
          <h2>Ingredientes</h2>
          <ul class="ingredient-list">
            ${(recipe.ingredients ?? []).map((ingredient, index) => `
              <li class="ingredient-item">
                <label><input type="checkbox" aria-label="Marcar ingrediente ${index + 1}"><span>${escapeHtml(ingredient)}</span></label>
              </li>`).join("")}
          </ul>
          ${(recipe.tips ?? []).length ? `
            <div class="tip-box">
              <strong>Dicas do Miguel</strong>
              <ul>${recipe.tips.map((tip) => `<li>${escapeHtml(tip)}</li>`).join("")}</ul>
            </div>` : ""}
        </aside>
        <section class="method">
          <h2>Preparação</h2>
          <ol class="method-list">
            ${(recipe.steps ?? []).map((step) => `<li class="method-step"><p>${escapeHtml(step)}</p></li>`).join("")}
          </ol>
        </section>
      </div>
    </article>
    <dialog class="cook-dialog" id="cook-dialog" aria-label="Modo cozinhar"></dialog>`;

  bindImageFallbacks();
  bindPlanButtons();
  $("#print-recipe")?.addEventListener("click", () => window.print());
  $("#start-cook")?.addEventListener("click", () => startCookMode(recipe));
  updatePlanCount();
}

async function startCookMode(recipe) {
  state.cookRecipe = recipe;
  state.cookIndex = 0;
  const dialog = $("#cook-dialog");
  drawCookMode();
  if (typeof dialog?.showModal === "function") dialog.showModal();
  else dialog?.setAttribute("open", "");
  dialog?.addEventListener("close", releaseWakeLock, { once: true });
  try {
    if ("wakeLock" in navigator) state.wakeLock = await navigator.wakeLock.request("screen");
  } catch (_) {
    state.wakeLock = null;
  }
}

function drawCookMode() {
  const dialog = $("#cook-dialog");
  const recipe = state.cookRecipe;
  if (!dialog || !recipe) return;
  const total = recipe.steps.length;
  const current = state.cookIndex + 1;
  dialog.innerHTML = `
    <div class="cook-inner">
      <div class="cook-top">
        <span>${escapeHtml(recipe.title)} · passo ${current} de ${total}</span>
        <button class="cook-close" type="button" id="close-cook" aria-label="Fechar modo cozinhar">×</button>
      </div>
      <div class="cook-progress" aria-hidden="true"><span style="width:${(current / total) * 100}%"></span></div>
      <div class="cook-step-copy"><p>${escapeHtml(recipe.steps[state.cookIndex])}</p></div>
      <div class="cook-controls">
        <button class="button button-secondary" type="button" id="previous-step" ${state.cookIndex === 0 ? "disabled" : ""}>Anterior</button>
        <button class="button button-primary" type="button" id="next-step">${current === total ? "Terminar" : "Seguinte"}</button>
      </div>
    </div>`;
  $("#close-cook")?.addEventListener("click", closeCookMode);
  $("#previous-step")?.addEventListener("click", () => {
    if (state.cookIndex > 0) {
      state.cookIndex -= 1;
      drawCookMode();
    }
  });
  $("#next-step")?.addEventListener("click", () => {
    if (state.cookIndex < total - 1) {
      state.cookIndex += 1;
      drawCookMode();
    } else {
      closeCookMode();
    }
  });
}

function closeCookMode() {
  const dialog = $("#cook-dialog");
  if (typeof dialog?.close === "function") dialog.close();
  else dialog?.removeAttribute("open");
  releaseWakeLock();
}

async function releaseWakeLock() {
  try { await state.wakeLock?.release(); } catch (_) { /* no action needed */ }
  state.wakeLock = null;
}

function shoppingKey(value) {
  return normalise(value)
    .replace(/\b(opcional|q\.?\s*b\.?)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function shoppingCategory(value) {
  const item = normalise(value);
  if (/camarao|ameijoa|tamboril|porco|bacon|presunto|ovos|manteiga/.test(item)) return "Peixaria, talho e frescos";
  if (/ervilha|congelad/.test(item)) return "Congelados";
  if (/arroz|noodles|massa|pao|cerveja|vinho|caldo|miso/.test(item)) return "Mercearia";
  if (/soja|sesamo|ostra|vinagre|azeite|oleo|sal|pimenta|acucar|canela|mel|louro|paprika/.test(item)) return "Temperos e molhos";
  return "Legumes, fruta e ervas";
}

function buildShoppingGroups(recipes) {
  const unique = new Map();
  recipes.forEach((recipe) => (recipe.shopping ?? recipe.ingredients ?? []).forEach((item) => {
    const key = shoppingKey(item);
    if (key && !unique.has(key)) unique.set(key, item);
  }));
  const groups = new Map();
  unique.forEach((item, key) => {
    const category = shoppingCategory(item);
    if (!groups.has(category)) groups.set(category, []);
    groups.get(category).push({ key, item });
  });
  return groups;
}

function renderShopping() {
  const chosen = state.recipes.filter((recipe) => state.planner.has(recipe.id));
  const groups = buildShoppingGroups(chosen);
  setPageMeta(`Lista de compras — ${state.site.name}`, "Lista de compras combinada das receitas escolhidas.");
  app.innerHTML = `
    <section class="shopping-shell">
      <a class="back-link" href="#receitas">← Voltar às receitas</a>
      <div class="shopping-header">
        <div>
          <p class="eyebrow">Planeamento</p>
          <h1>Lista de compras</h1>
          <p>Junta os ingredientes das receitas escolhidas, marca o que já tens e leva a lista contigo.</p>
        </div>
        ${chosen.length ? `
          <div class="shopping-actions">
            <button class="button button-primary" id="copy-shopping" type="button">Copiar lista</button>
            <button class="button button-danger" id="clear-plan" type="button">Limpar tudo</button>
          </div>` : ""}
      </div>

      ${chosen.length ? `
        <section class="chosen-recipes">
          <h2>Receitas escolhidas</h2>
          <div class="chosen-chips">${chosen.map((recipe) => `<span class="chosen-chip">${escapeHtml(recipe.title)}</span>`).join("")}</div>
        </section>
        <div class="shopping-grid">
          ${[...groups.entries()].map(([category, items]) => `
            <section class="shopping-group">
              <h2>${escapeHtml(category)}</h2>
              ${items.map(({ key, item }) => `
                <label class="shop-item ${state.checked.has(key) ? "is-checked" : ""}">
                  <input type="checkbox" data-shop-key="${escapeHtml(key)}" ${state.checked.has(key) ? "checked" : ""}>
                  <span>${escapeHtml(item)}</span>
                </label>`).join("")}
            </section>`).join("")}
        </div>` : `
        <div class="empty-state">
          <h3>A tua lista ainda está vazia</h3>
          <p>Escolhe uma ou mais receitas e carrega em “+ Compras”. Nós tratamos de juntar os ingredientes.</p>
          <a class="button button-primary" href="#receitas">Escolher receitas</a>
        </div>`}
    </section>`;

  $$('[data-shop-key]').forEach((checkbox) => checkbox.addEventListener("change", () => {
    checkbox.checked ? state.checked.add(checkbox.dataset.shopKey) : state.checked.delete(checkbox.dataset.shopKey);
    checkbox.closest(".shop-item")?.classList.toggle("is-checked", checkbox.checked);
    persistSet(STORAGE.checked, state.checked);
  }));
  $("#copy-shopping")?.addEventListener("click", () => copyShoppingList(groups));
  $("#clear-plan")?.addEventListener("click", () => {
    state.planner.clear();
    state.checked.clear();
    persistSet(STORAGE.planner, state.planner);
    persistSet(STORAGE.checked, state.checked);
    renderShopping();
  });
  updatePlanCount();
}

async function copyShoppingList(groups) {
  const text = [...groups.entries()].map(([category, items]) => {
    const lines = items.map(({ key, item }) => `${state.checked.has(key) ? "☑" : "☐"} ${item}`);
    return `${category}\n${lines.join("\n")}`;
  }).join("\n\n");
  try {
    await navigator.clipboard.writeText(text);
    showToast("Lista copiada.");
  } catch (_) {
    const field = document.createElement("textarea");
    field.value = text;
    field.style.position = "fixed";
    field.style.opacity = "0";
    document.body.append(field);
    field.select();
    document.execCommand("copy");
    field.remove();
    showToast("Lista copiada.");
  }
}

function renderNotFound() {
  setPageMeta(`Receita não encontrada — ${state.site.name}`, state.site.tagline);
  app.innerHTML = `
    <section class="detail-shell">
      <div class="error-state">
        <h2>Esta receita não está na mesa</h2>
        <p>O endereço pode ter mudado ou a receita pode ainda não estar publicada.</p>
        <a class="button button-primary" href="#receitas">Ver todas as receitas</a>
      </div>
    </section>`;
}

function bindPlanButtons() {
  $$('[data-plan]').forEach((button) => button.addEventListener("click", () => {
    const id = button.dataset.plan;
    if (state.planner.has(id)) {
      state.planner.delete(id);
      showToast("Receita removida da lista.");
    } else {
      state.planner.add(id);
      showToast("Receita adicionada à lista de compras.");
    }
    persistSet(STORAGE.planner, state.planner);
    const currentHash = decodeURIComponent(location.hash);
    if (currentHash.startsWith("#receita/")) renderDetail(id);
    else renderHome();
  }));
}

function bindImageFallbacks() {
  $$('[data-recipe-image]').forEach((image) => image.addEventListener("error", () => {
    const placeholder = document.createElement("div");
    placeholder.className = "media-placeholder";
    placeholder.dataset.letter = image.dataset.letter || "M";
    placeholder.dataset.category = image.dataset.category || "entradas";
    placeholder.setAttribute("role", "img");
    placeholder.setAttribute("aria-label", image.alt ? `${image.alt} — fotografia ainda não disponível` : "Fotografia ainda não disponível");
    image.replaceWith(placeholder);
  }, { once: true }));
}

function updatePlanCount() {
  $$('[data-plan-count]').forEach((element) => { element.textContent = state.planner.size; });
}

function persistSet(key, set) {
  try { localStorage.setItem(key, JSON.stringify([...set])); } catch (_) { /* storage is optional */ }
}

function restoreSet(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]");
    return new Set(Array.isArray(value) ? value : []);
  } catch (_) {
    return new Set();
  }
}

let toastTimer;
function showToast(message) {
  const toast = $("#toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 2600);
}

function setPageMeta(title, description) {
  document.title = title;
  $("meta[name='description']")?.setAttribute("content", description);
  $("meta[property='og:title']")?.setAttribute("content", title);
  $("meta[property='og:description']")?.setAttribute("content", description);
}

function applySiteSettings() {
  $$('[data-site-name]').forEach((element) => { element.textContent = state.site.name; });
  $$('[data-footer-copy]').forEach((element) => { element.textContent = state.site.footer; });
  $("#year").textContent = new Date().getFullYear();
}

function route({ scroll = true } = {}) {
  const hash = location.hash || "#inicio";
  if (hash.startsWith("#receita/")) {
    const id = decodeURIComponent(hash.slice("#receita/".length));
    renderDetail(id);
  } else if (hash === "#compras") {
    renderShopping();
  } else {
    renderHome();
  }
  if (scroll && hash === "#receitas") {
    requestAnimationFrame(() => $("#receitas")?.scrollIntoView({ block: "start" }));
  } else if (scroll) {
    window.scrollTo({ top: 0, behavior: "auto" });
  }
}

async function loadData() {
  try {
    const [recipesResponse, siteResponse] = await Promise.all([
      fetch("data/recipes.json", { cache: "no-store" }),
      fetch("data/site.json", { cache: "no-store" })
    ]);
    if (!recipesResponse.ok) throw new Error("Não foi possível carregar as receitas.");
    const recipes = await recipesResponse.json();
    if (!Array.isArray(recipes)) throw new Error("O ficheiro de receitas não tem o formato esperado.");
    state.recipes = recipes.filter((recipe) => recipe && recipe.published !== false);
    if (siteResponse.ok) state.site = { ...state.site, ...(await siteResponse.json()) };
    const validIds = new Set(state.recipes.map((recipe) => recipe.id));
    state.planner = new Set([...restoreSet(STORAGE.planner)].filter((id) => validIds.has(id)));
    state.checked = restoreSet(STORAGE.checked);
    applySiteSettings();
    route({ scroll: false });
  } catch (error) {
    console.error(error);
    app.innerHTML = `
      <section class="detail-shell">
        <div class="error-state">
          <h2>Não foi possível carregar as receitas</h2>
          <p>Confirma que estás a abrir o site através de um servidor ou do GitHub Pages e tenta novamente.</p>
          <button class="button button-primary" type="button" id="retry-load">Tentar novamente</button>
        </div>
      </section>`;
    $("#retry-load")?.addEventListener("click", loadData);
  }
}

window.addEventListener("hashchange", () => route());
loadData();
